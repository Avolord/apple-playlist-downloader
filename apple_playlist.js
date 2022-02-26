const axios = require("axios");
const JSSoup = require("jssoup").default;
const htmlEntities = require("html-entities");

function scrape_playlist_data(html) {
  let soup = new JSSoup(html);

  //scraping...
  const playlistHeaderBlock = soup.find("div", "album-header-metadata");
  let playlistName = playlistHeaderBlock.find("h1").text.trim();
  let playlistUser = playlistHeaderBlock
    .find("div", "product-creator")
    .text.trim();

    const tracksInfo = soup.findAll("div", "songs-list-row"); //finding all songs info
    const playlistObj = {
      songs: [],
      playlist: htmlEntities.decode(playlistName),
      user: htmlEntities.decode(playlistUser),
      total: tracksInfo.length
    };

  for (let track of tracksInfo) {
    let songName = track.find("div", "songs-list-row__song-name").text;
    let singerNames = track.find("div", "songs-list-row__by-line").text;
    let album = track.find("div", "songs-list__col--album").text;
    singerNames = singerNames.replace(/\s{2,10}/g, ""); //remove spaces
    songName = songName.replace(/\?|<|>|\*|"|:|\||\/|\\/g, ""); //removing special characters which are not allowed in file name
    playlistObj.songs.push({
      name: htmlEntities.decode(songName),
      singer: htmlEntities.decode(singerNames),
      album: htmlEntities.decode(album),
    });
  }

  return playlistObj;
}

async function get_playlist(url) {
  const response = await axios.get(url)
    .catch(() => {
      throw new Error("An error has occurred while fetching the playlist url.");
    });
  
  let htmlContent = response.data;
  
  return scrape_playlist_data(htmlContent);

}

module.exports = {
  get_playlist
};
