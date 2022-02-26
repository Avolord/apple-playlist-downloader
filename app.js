const fs = require("fs");
const request = require("request");
const ProgressBar = require("progress");
const axios = require("axios");
const NodeID3 = require("node-id3");
const itunesAPI = require("node-itunes-search");
const playlist = require("./apple_playlist");

const INFO_URL = "https://slider.kz/vk_auth.php?q=";
const DOWNLOAD_URL = "https://slider.kz/download/";
//temporary playlist url
const PLAYLIST_URL = "https://music.apple.com/de/playlist/motivation/pl.u-4Joma4DTae67NlX?l=en";
//----------------------

async function download(song, url, song_name, singer_names, query_artwork, song_number, total_song_number) {
  let promise = new Promise(async function(reject, resolve) {
    console.log(`(${song_number}/${total_song_number}) Starting download: ${song}`);
    const { data, headers } = await axios({
      method: "GET",
      url: url,
      responseType: "stream",
    });

    //for progress bar...
    const totalLength = headers["content-length"];
    const progressBar = new ProgressBar(
      "-> downloading [:bar] :percent :etas",
      {
        width: 40,
        complete: "=",
        incomplete: " ",
        renderThrottle: 1,
        total: parseInt(totalLength),
      }
    );

    data.on("data", (chunk) => progressBar.tick(chunk.length));
    data.on("end", () => {
      singer_names = singer_names.replace(/\s{2,10}/g, "");
      console.log("DOWNLOADED!");
      const filepath = `${__dirname}/songs/${song}.mp3`;
      //Replace all connectives by a simple ','
      singer_names = singer_names.replace(" and ", ", ");
      singer_names = singer_names.replace(" et ", ", ");
      singer_names = singer_names.replace(" und ", ", ");
      //Search track informations using the Itunes library
      const searchOptions = new itunesAPI.ItunesSearchOptions({
        term: query_artwork, // All searches require a single string query.
        limit: 1, // An optional maximum number of returned results may be specified.
      });
      //Use the result to extract tags
      itunesAPI.searchItunes(searchOptions).then((result) => {
        try {
          // Get all the tags and cover art of the track using node-itunes-search and write them with node-id3
          let maxres = result.results[0]["artworkUrl100"].replace(
            "100x100",
            "3000x3000"
          );
          let year = result.results[0]["releaseDate"].substring(0, 4);
          let genre = result.results[0]["primaryGenreName"].replace(
            /\?|<|>|\*|"|:|\||\/|\\/g,
            ""
          );
          let trackNumber = result.results[0]["trackNumber"];
          let trackCount = result.results[0]["trackCount"];
          trackNumber = trackNumber + "/" + trackCount;
          let album = result.results[0]["collectionName"].replace(
            /\?|<|>|\*|"|:|\||\/|\\/g,
            ""
          );

          let query_artwork_file = song + ".jpg";
          download_artwork(maxres, query_artwork_file, function () {
            //console.log('Artwork downloaded');
            const tags = {
              TALB: album,
              title: song_name,
              artist: singer_names,
              APIC: query_artwork_file,
              year: year,
              trackNumber: trackNumber,
              genre: genre,
            };
            //console.log(tags);
            const success = NodeID3.write(tags, filepath);
            console.log("WRITTEN TAGS");
            try {
              fs.unlinkSync(query_artwork_file);
              //file removed
            } catch (err) {
              console.error(err);
            }
          });
        } catch {
          console.log("Full tags not found for " + song_name);
          const tags = {
            title: song_name,
            artist: singer_names,
          };
          //console.log(tags);
          const success = NodeID3.write(tags, filepath);
          console.log("WRITTEN TAGS (Only artist name and track title)");
        }
      });
    });

    //for saving in file...
    data.pipe(fs.createWriteStream(`${__dirname}/songs/${song}.mp3`));
    resolve();
  });

  return promise;
}

/**
 * Downloads the artwork from a song
 * @param {String} uri 
 * @param {String} filename 
 * @param {function} callback 
 */
function download_artwork(uri, filename, callback) {
  request.head(uri, function (err, res, body) {
    request(uri).pipe(fs.createWriteStream(filename)).on("close", callback);
  });
}

async function get_url(song, singer, album, song_number, total_song_number) {
  let query = (singer + "%20" + song).replace(/\s/g, "%20");
  const { data } = await axios.get(encodeURI(INFO_URL + query));

  // when no result then [{}] is returned so length is always 1, when 1 result then [{id:"",etc:""}]
  if (!data["audios"][""][0].id) {
    //no result
    console.log("==[ SONG NOT FOUND! ]== : " + song);
    notFound.push(song + " - " + singer);

    return null;
  }

  //avoid remix,revisited,mix
  let i = 0;
  let track = data["audios"][""][i];
  let totalTracks = data["audios"][""].length;
  while (i < totalTracks && /remix|revisited|reverb|mix/i.test(track.tit_art)) {
    i += 1;
    track = data["audios"][""][i];
  }
  //if reach the end then select the first song
  if (!track) {
    track = data["audios"][""][0];
  }

  let songName = track.tit_art.replace(/\?|<|>|\*|"|:|\||\/|\\/g, ""); //removing special characters which are not allowed in file name

  if (fs.existsSync(__dirname + "/songs/" + songName + ".mp3")) {
    console.log(
      "(" + song_number + "/" + total_song_number + ") - Song already present!!!!! " + song
    );
    return null;
  }

  let link = DOWNLOAD_URL + track.id + "/";
  link = link + track.duration + "/";
  link = link + track.url + "/";
  link = link + songName + ".mp3" + "?extra=";
  link = link + track.extra;
  link = encodeURI(link); //to replace unescaped characters from link

  let artwork_query = encodeURI(track.tit_art + " " + album);

  return { link, artwork_query, sanitized_songname: songName };
}

async function download_song(song, song_number, total_song_number) {
  let promise = new Promise(function (resolve, reject) {
    get_url(song.name, song.singer, song.album, song_number, total_song_number)
      .then((res) => {
        if(res)
        return download(res.sanitized_songname, res.link, song.name, song.singer, res.artwork_query, song_number, total_song_number);
      })
      .then(() => {
        resolve();
      })
      .catch((err) => {
        reject(err);
      });
  });
  return promise;
}

async function start_playlist_download(playlist_data) {
  console.log("STARTING....");

  songsList = playlist_data.songs;
  total = playlist_data.total;
  console.log("Total songs:" + total);

  let missing_songs = [];
  for (let [i, song] of playlist_data.songs.entries()) {
    await download_song(song, i + 1, total)
      .catch((err) => {
        missing_songs.push(song);
      });
  }

  console.log("\n#### ALL SONGS ARE DOWNLOADED!! ####\n");
  console.log("Songs that could not be found:-");
  if (missing_songs.length === 0) {
    console.log("None!");
  } else {
    for (let [i, song] of missing_songs.entries()) {
      console.log(`${i + 1} - ${song.name}`);
    }
  }
}

/**
 * The entrypoint for the project
 */
async function main() {
  //create folder
  const dir = __dirname + "/songs";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }

  playlist.get_playlist(PLAYLIST_URL)
    .then((res) => {
      return start_playlist_download(res);
    })
    .catch((err) => {
      console.log(err);
    });
}

main();