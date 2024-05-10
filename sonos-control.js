/********************************************************
*
* Macro Author:      	William Mills
*                    	Technical Solutions Specialist
*                    	wimills@cisco.com
*                    	Cisco Systems
*
* Version: 1-0-0
* Released: 03/05/24
*
* This example macro lets you sign into a Sonos Account on 
* your RoomOS Device via OAuth and control Sonos Player Groups
* playback which are available in your Sonos Household.
*
* Features Included:
* - Sonos OAuth locally on the Cisco Device so no backend required
* - Play Group selection and filtering
* - Playlist selection for each player group
* - The following playback controls:
*   Mute|Volume|Play|Pause|Next and Previous Tracks
* 
* Full Readme, source code and license agreement available on Github:
* https://github.com/wxsd-sales/roomos-sonos-macro
*
********************************************************/

import xapi from 'xapi';


/*********************************************************
 * Configure the settings below
 **********************************************************/

const config = {
  sonos: {
    client_id: '< Your Sonos OAuth Integration Client Id >',
    client_secret: '< Your Sonos OAuth Integration Client Secret >'
  },
  filterGroups: ['My Player Group'], // Array of Group/Location names, used to filter discovered Groups
  webauth: 'https://wxsd-sales.github.io/roomos-sonos-macro/webapp',
  panelId: 'sonos'
}

/*********************************************************
 * Main functions and event subscriptions
 **********************************************************/

const panelId = config.panelId;

let auth; // Cache OAuth
let households;
let groups;

let playlists;
let selectedGroupId;
let selectedGroupName;

let selectedPlaylistId;
let selectedPlaylistName;

let playingTitle;
let playingArtist;

let currentPage;
let polling;

let setupWebViews = {};
let webviewListener;


init()

async function init() {

  // Enable WebEngine and Disable Macro if not available
  try {
    xapi.Config.WebEngine.Mode.set("On")
  } catch (error) {
    console.warn("WebEngine not available:", JSON.stringify(error));
    const macroName = _main_macro_name();
    console.log(`Deactivating Macro [${macroName}]`)
    xapi.Command.Macros.Macro.Deactivate({ Name: macroName });
    return
  }

  xapi.Config.HttpClient.Mode.set("On");

  // Load previously stored data if available
  const data = await loadData();
  //const data = false;

  console.debug('Loaded Data', data);
  if (data) {
    console.log('Sonos Integration Details Loaded');
    if (checkIfExpired(data.refreshExpire)) {
      console.log('Sonos Integration Expired');
    } else if (checkIfExpired(data.accessExpired)) {
      console.log('Sonos Access Token Expired');

      const newData = await getAccessToken({ refreshToken: data.refreshToken, refreshExpire: data.refreshExpire })
      auth = newData
      //refreshAccessToken(data.refreshToken);
    } else {
      //const newData = await getAccessToken({ refreshToken: data.refreshToken })
      //refreshAccessToken(data.refreshToken);
      auth = data;
    }


  } else {
    console.log('Sonos Integration not activated')
  }

  // Listen and process Widget Clicks and releases
  xapi.Event.UserInterface.Extensions.Widget.Action.on(processWidget);
  xapi.Event.UserInterface.Extensions.Event.PageOpened.on(({ PageId }) => processPageEvents(PageId, 'opened'));
  xapi.Event.UserInterface.Extensions.Event.PageClosed.on(({ PageId }) => processPageEvents(PageId, 'closed'));
  xapi.Event.UserInterface.Extensions.Widget.LayoutUpdated.on(async () => {
    if(!auth) return
    const data = await loadData();
    if(!data)
    console.log('Data was erased - Saving new copy')
    saveData(auth)
    });

  syncWithSonos();

}

async function syncWithSonos() {

  if (!auth) {
    createPanel();
    return
  }

  households = await getHouseholds();
  console.debug('Housholds:', households)

  if (!households) {
    createPanel();
    return
  }

  groups = await getGroups({ householdId: households[0].id })
  console.debug('Groups:', groups)

  if (!groups) {
    createPanel();
    return
  }

  const filteredGroups = filterGroups(groups)
  const availableGroups = filteredGroups.filter(group=>group.available)

  if (availableGroups.length == 1) {
    selectedGroupId = availableGroups[0].id;
    selectedGroupName = availableGroups[0].name;
  }

  playlists = await getPlaylists({ householdId: households[0].id })
  console.debug('Playlists:', playlists)

  createPanel()
}


/*********************************************************
 * Process all Widget Action Events
 **********************************************************/
async function processWidget(e) {
  if (!e.WidgetId.startsWith(config.panelId)) return;
  const [panelId, command, option] = e.WidgetId.split("-");
  if (e.Type == "clicked") {
    switch (command) {
      case "setup":
        if (setupWebViews.hasOwnProperty(option)) return
        if (!webviewListener) {
          webviewListener = xapi.Status.UserInterface.WebView.on(processWebViews);
        }
        const url = `${config.webauth}#client_id=${config.sonos.client_id}`;
        console.log('Opening WebAuth URL:', url)
        setupWebViews[option] = null;
        xapi.Command.UserInterface.WebView.Display({ Url: url, Target: option });
        break;
      case "playPause":
        togglePlayPause({ groupId: selectedGroupId });
        break;
      case "NextTrack": case "PreviousTrack":
        skipTrack({ direction: command, groupId: selectedGroupId })
        break;
      case "toggleMute":
        toggleMute({ groupId: selectedGroupId })
        break;
      case 'selectPlaylist':
        selectedPlaylistId = option;
        loadPlaylist({ groupId: selectedGroupId, playlistId: option })
        const playlist = playlists.find(playlist => playlist.id == selectedPlaylistId)
        selectedPlaylistName = playlist.name
        await createPanel('controls');
        processPageEvents(`${panelId}-controls`, 'opened')
        break;
      case 'selectGroup':
        selectedGroupId = option;
        const group = groups.find(group => group.id == selectedGroupId)
        selectedGroupName = group.name
        await createPanel('controls');
        processPageEvents(`${panelId}-controls`, 'opened')
        break;
      case 'openGroups':
        processPageEvents(`${panelId}-controls`, 'closed')
        await createPanel('openGroups')
        if (selectedGroupId) {
          xapi.Command.UserInterface.Extensions.Widget.SetValue({
            Value: 'active',
            WidgetId: `${panelId}-selectGroup-${selectedGroupId}`
          });
        }
        groups = await getGroups({ householdId: households[0].id })
        if (selectedGroupId) {
          xapi.Command.UserInterface.Extensions.Widget.SetValue({
            Value: 'active',
            WidgetId: `${panelId}-selectGroup-${selectedGroupId}`
          });
        }
        break;
      case 'openPlaylists':
        processPageEvents(`${panelId}-controls`, 'closed')
        createPanel('openPlaylists')
        playlists = await getPlaylists({ householdId: households[0].id })
        createPanel('openPlaylists')
        break;
      case 'controls':
        await createPanel('controls');
        processPageEvents(`${panelId}-controls`, 'opened')
        break;
    }
  } else if (e.Type == "released" && command == 'volume') {
    // Convert slider value 0 - 255 to 0 - 100
    const convertedVolume = Math.round((parseInt(e.Value) / 255) * 100)
    console.log(`UI Volume Changed [${e.Value}/255] - Converted To: [${convertedVolume}/100]`)
    setVolume({ groupId: selectedGroupId, volume: convertedVolume })
  }

}


/*********************************************************
* Process any changes to the Web Views status
**********************************************************/
async function processWebViews(event) {
  console.log(event)
  if (event.hasOwnProperty("URL")) {
    if (!event.URL.startsWith(config.webauth)) return

    // Stored WebView Id if opened on a valid target
    if (setupWebViews.hasOwnProperty('OSD') && setupWebViews.OSD == null)
      setupWebViews.OSD = event.id;
    if (setupWebViews.hasOwnProperty('Controller') && setupWebViews.Controller == null)
      setupWebViews.Controller = event.id;


    console.log('Setup WebViews:', JSON.stringify(setupWebViews))

    const splitURL = event.URL.split('?');
    if (splitURL.length != 2) return
    let params = {};
    const splitParams = splitURL.pop().split("&");
    for (let i = 0; i < splitParams.length; i++) {
      let parameter = splitParams[i].split("=");
      if (parameter.length == 2) {
        params[parameter[0]] = parameter[1];
      }
    }

    if (!params.hasOwnProperty('code')) return
    console.debug('OAuth URL with Code Identified:', event.URL)
    console.log('Getting Access Token')

    const data = await getAccessToken({ code: params.code })

    if (data) {
      closeWebViews();
      auth = data;
      saveData(data);
      await syncWithSonos();
      xapi.Command.UserInterface.Message.Alert.Display({
        Title: 'Sonos',
        Text: 'Signed into Sonos 🎉',
        Duration: 5
      });
    } else {
      closeWebViews();
      xapi.Command.UserInterface.Message.Alert.Display({
        Title: 'Alert',
        Text: 'Error while Authenticating with Sonos',
        Duration: 5
      });

    }
  } else if (event.hasOwnProperty("ghost")) {

    console.log('Setup WebViews:', JSON.stringify(setupWebViews))
    console.log('WebView Id:', event.id, ' Ghosted - Setup WebViews tracker:', JSON.stringify(setupWebViews))

    if (setupWebViews.hasOwnProperty('OSD') && setupWebViews.OSD == event.id) {
      delete setupWebViews.OSD
      if (!setupWebViews.hasOwnProperty('Controller')) setupCancelledAlert();
    }
    if (setupWebViews.hasOwnProperty('Controller') && setupWebViews.Controller == event.id) {
      delete setupWebViews.Controller
      if (!setupWebViews.hasOwnProperty('OSD')) setupCancelledAlert();
    }
  }
}

function setupCancelledAlert() {
  console.log('User closed WebViews before completing Sonos OAuth')
  xapi.Command.UserInterface.Message.Alert.Display({
    Title: 'Alert',
    Text: 'Sign in with Sonos account cancelled',
    Duration: 5
  });

}

/**
 * Closes any openWebView on the OSD or Controller and
 * unsubscribes WebView xStatus monitoring
 */
function closeWebViews() {
  console.log('Unsubscribing from WebView Listener')
  if (!webviewListener) return
  webviewListener()
  webviewListener = () => void 0;

  if (setupWebViews.hasOwnProperty('OSD')) xapi.Command.UserInterface.WebView.Clear({ Target: 'OSD' })
  if (setupWebViews.hasOwnProperty('Controller')) xapi.Command.UserInterface.WebView.Clear({ Target: 'Controller' })
  setupWebViews = {}
}

/**
 * Process Page 'opened' and 'closed' events for the control page
 * and start/stop polling player status accordingly
 * @property {string}  pageId   - UI Extension PageId
 * @property {string}  event    - Page 'opened' | 'closed' event
 */
function processPageEvents(pageId, event) {
  if (!pageId.startsWith(config.panelId)) return
  console.log('PageId:', pageId, ' Event:', event)
  const [_panelId, page] = pageId.split("-");
  if (event == 'opened' && page == 'controls') {
    switch (page){
      case 'controls':
        updateStatus()
        if (polling) clearInterval(polling)
        polling = setInterval(updateStatus, 5000)
      case 'setup':
        createPanel();
    }
    

  } else if (event == 'closed') {
    switch (page) {
      case 'controls':
        if (!polling) return;
        clearInterval(polling)
        polling = null;
        break;
      case 'playlists': case 'locations':
        createPanel();
        break;
    }
  }
}

/**
 * Fetches the Player Group playback and volume status and updates the UI Extension
 */
async function updateStatus() {
  if (!selectedGroupId) return;
  const panelId = config.panelId;

  const metadata = await getMetadataStatus({ groupId: selectedGroupId })
  const groupVolume = await getVolume({ groupId: selectedGroupId })
  const playback = await getPlaybackStatus({ groupId: selectedGroupId })

  console.debug('metadata:', metadata)
  console.debug('groupVolume:', groupVolume)
  console.debug('playback:', playback)

  const contentName = metadata?.container?.name;
  const contentType = metadata?.container?.type;
  const trackName = metadata?.currentItem?.track?.name;
  const artistName = metadata?.currentItem?.track?.artist?.name;

  console.debug('contentName:', contentName, 'contentType:', contentType)
  console.debug('TrackName:', trackName, 'PlayingTile:', playingTitle)
  if (trackName && (playingTitle != trackName)) {
    console.debug('Setting PlayingTitle to TrackName', trackName)
    playingTitle = trackName;
    if (currentPage == 'controls') await createPanel('controls')
  } else if (!trackName && playingTitle) {
    console.debug('Resetting PlayingTitle')
    playingTitle = null;
    if (currentPage == 'controls') await createPanel('controls')
  }

  if (currentPage != 'controls') return

  const volume = Math.round((parseInt(groupVolume.volume) / 100) * 255)
  console.log(`Group Volume: [${groupVolume.volume}/100] - Updating Slider to [${volume}/255]`)
  xapi.Command.UserInterface.Extensions.Widget.SetValue({ Value: volume, WidgetId: `${panelId}-volume` });

  if (groupVolume.muted) {
    xapi.Command.UserInterface.Extensions.Widget.SetValue({ Value: 'active', WidgetId: `${panelId}-toggleMute` });
  } else {
    xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: `${panelId}-toggleMute` })
  }


  //PLAYBACK_STATE_IDLE PLAYBACK_STATE_BUFFERING PLAYBACK_STATE_PAUSED PLAYBACK_STATE_PLAYING
  if (playback.playbackState == 'PLAYBACK_STATE_PLAYING') {
    xapi.Command.UserInterface.Extensions.Widget.SetValue({ Value: 'active', WidgetId: `${panelId}-playPause` });
  } else {
    xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: `${panelId}-playPause` })
  }

  if (artistName) {
    xapi.Command.UserInterface.Extensions.Widget.SetValue({ Value: artistName, WidgetId: `${panelId}-artistText` });
  } else {
    xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: `${panelId}-artistText` })
  }

}

function filterGroups(groups){
  if(config.filterGroups && config.filterGroups.length > 0){
    return groups.map(group => {
      return {id: group.id,
      name: group.name,
      available: config.filterGroups.includes(group.name)
      }
    })
  }

  return groups.map(group => {
      return {id: group.id,
      name: group.name,
      available: true
      }
    })
}

/**
 * Get the Sonos Access Token via Auth Code or Refresh Token flow
 * @property {object}  args               - Arguments Object
 * @property {string}  args.refreshToken  - SONOS Integration Refresh Token
 * @property {string}  args.code          - SONOS Inegration Authorization Code
 */
function getAccessToken(args) {
  if (!args || !(args.hasOwnProperty('refreshToken') || args.hasOwnProperty('code'))) {
    throw new Error('getAccessToken requires arguments object - either { refreshToken: string } or { code: string }');
  }

  let parameters = '';
  if (args.hasOwnProperty('refreshToken')) {
    parameters = `?grant_type=refresh_token&refresh_token=${args.refreshToken}`;
  } else {
    parameters = `?grant_type=authorization_code&code=${args.code}&redirect_uri=${config.webauth}`;
  }

  const url = 'https://api.sonos.com/login/v3/oauth/access' + parameters;
  console.debug(`Getting Access Token:`, url)

  const basicAuth = btoa(`${config.sonos.client_id}:${config.sonos.client_secret}`);

  return xapi.Command.HttpClient.POST({
    Header: ['Content-Type: application/x-www-form-urlencoded;charset=utf-8',
      'accept: application/json',
      'authorization: Basic ' + basicAuth],
    ResultBody: 'PlainText',
    Url: url
  }, '')
    .then(result => {
      //console.debug(result)
      const data = JSON.parse(result.Body);
      let accessExpire = new Date();
      accessExpire.setSeconds(accessExpire.getSeconds() + data.expires_in - 60);
      let refreshExpire = new Date();
      refreshExpire.setFullYear(refreshExpire.getFullYear() + 1);

      return {
        accessToken: data.access_token,
        accessExpire,
        refreshToken: data.refresh_token,
        refreshExpire
      }
    })
    .catch(error => {
      throw new Error('Error Getting Access Token - Response Code: ' + error.data.StatusCode);
    })
}

/**
 * Gets list of all online Households
 */
async function getHouseholds() {
  //const offline = await sonosAPI({ method: 'GET', endpoint: '/households?connectedOnly=false' })
  const result = await sonosAPI({ method: 'GET', endpoint: '/households?connectedOnly=true' })
  return result.households
}

/**
 * Gets all Connected Player Groups for given Household Id
 * @property {object}  args             - Arguments Object
 * @property {string}  args.householdId - SONOS Household Id
 */
async function getGroups(args) {
  if (!args || !args.hasOwnProperty('householdId')) {
    throw new Error('getGroups requires arguments object -  { householdId: "householdId" }');
  }

  //REF: GET  https://api.ws.sonos.com/control/api/v1/households/householdId/groups 
  console.log('Getting Groups in household:', args.householdId)
  const result = await sonosAPI({ method: 'GET', endpoint: `/households/${args.householdId}/groups` })

  if (!result?.groups) {
    console.warn('No Groups were returned')
    return []
  }

  console.log('Groups found: ', result.groups.length)

  return result.groups
  householdGroups = result.groups;

  const filterGroups = config.filterGroups
  // If filters are configured, apply filter to group.
  // Otherwire return the unfiltered group
  if (!filterGroups) return result.groups
  if (filterGroups.length == 0) return result.groups
  const filteredGroups = result.groups.filter(group => filterGroups.includes(group.name))

  console.log('Filtered Groups - Result: ', filteredGroups.length);

  return filteredGroups
}


/**
 * Instucts the Player Group to toggle between Playing and Paused
 * @property {object}  args             - Arguments Object
 * @property {string}  args.groupId     - SONOS Player Group Id
 */
function togglePlayPause(args) {
  if (!args || !args.hasOwnProperty('groupId')) {
    throw new Error('togglePlayPause requires arguments object -  { groupId: "groupId" }');
  }
  console.log('Toggle Play/Pause for group id:', args.groupId)
  sonosAPI({ method: 'POST', endpoint: `/groups/${args.groupId}/playback/togglePlayPause` })
    .then(result => console.log('toggle play/pause result', result))


  xapi.Status.UserInterface.Extensions.Widget.get()
    .then(widgets => {
      const widget = widgets.find(widget => widget.WidgetId == `${panelId}-playPause`)
      if (widget.Value == 'active') {
        xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: `${panelId}-playPause` })
      } else {
        xapi.Command.UserInterface.Extensions.Widget.SetValue({ Value: 'active', WidgetId: `${panelId}-playPause` });
      }
    })
}

/**
 * Gets the Group Playback status
 * @property {object}  args             - Arguments Object
 * @property {string}  args.groupId     - SONOS Player Group Id
 */
function getPlaybackStatus(args) {
  if (!args || !args.hasOwnProperty('groupId')) {
    throw new Error('getPlaybackStatus requires arguments object -  { groupId: "groupId" }');
  }
  //REF GET https://api.ws.sonos.com/control/api/v1/groups/groupId/playback \
  console.log('Getting Playback Status from group Id:', args.groupId)
  return sonosAPI({ method: 'GET', endpoint: `/groups/${args.groupId}/playback` })
}

/**
 * Instucts the Player Group to Skip Tracks to either Next or Previous Track
 * @property {object}  args             - Arguments Object
 * @property {string}  args.direction   - Skip Direction: NextTrack | PreviousTrack
 * @property {string}  args.groupId     - SONOS Player Group Id
 */
function skipTrack(args) {
  if (!args || !(args.hasOwnProperty('direction') || args.hasOwnProperty('groupId'))) {
    throw new Error('skipTrack requires arguments object -  { direction: "NextTrack" | "PreviousTrack",  groupId: "groupId" }');
  }

  if (args.direction != 'NextTrack' && args.direction != 'PreviousTrack') {
    throw new Error(`only the directions are supported 'NextTrack' | 'PreviousTrack'`);
  }

  console.log(`Sending skip track direciton [${args.direction}] to group Id [${args.groupId}] `)
  // https://api.ws.sonos.com/control/api/v2/groups/groupId/playback/skipToNextTrack \

  sonosAPI({ method: 'POST', endpoint: `/groups/${args.groupId}/playback/skipTo${args.direction}` })
    .then(result => console.debug('Result from Skip Track:', result))
}


/**
 * Instucts the Player Group to toggle between Mute and Un-Muted
 * @property {object}  args             - Arguments Object
 * @property {string}  args.groupId     - SONOS Player Group Id
 */
async function toggleMute(args) {
  if (!args || !args.hasOwnProperty('groupId')) {
    throw new Error('toggleMute requires arguments object -  { groupId: "groupId" }');
  }
  const current = await getVolume(args)
  console.log('current:', current)
  setMute({ groupId: args.groupId, muted: !current.muted })
  const panelId = config.panelId;
  if (!current.muted) {
    xapi.Command.UserInterface.Extensions.Widget.SetValue({ Value: 'active', WidgetId: `${panelId}-toggleMute` });
  } else {
    xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: `${panelId}-toggleMute` })
  }
}


/**
 * Gets SONOS Player Group volume state
 * @property {object}  args             - Arguments Object
 * @property {string}  args.groupId     - SONOS Player Group Id
 */
function getVolume(args) {
  if (!args || !args.hasOwnProperty('groupId')) {
    throw new Error('getVolume requires arguments object -  { groupId: "groupId" }');
  }
  console.log('Getting Volume for group Id: ', args.groupId)
  return sonosAPI({ method: 'GET', endpoint: `/groups/${args.groupId}/groupVolume` })
  //REF: GET https://api.ws.sonos.com/control/api/v2/groups/groupId/groupVolume \
}

/**
 * Sets SONOS Player Group volume 
 * @property {object}  args             - Arguments Object
 * @property {string}  args.groupId     - SONOS Player Group Id
 */
function setVolume(args) {
  if (!args || !(args.hasOwnProperty('groupId') && args.hasOwnProperty('volume'))) {
    throw new Error('setVolume requires arguments object -  { groupId: "groupId", volume: 0-100 }');
  }

  if (args.volume < 0 || args.volume > 100) {
    throw new Error('setVolume requires arguments object -  { groupId: "groupId", volume: 0-100 }');
  }
  const panelId = config.panelId;
  console.log('Setting Volume', args.volume, 'for group Id: ', args.groupId)
  sonosAPI({ method: 'POST', endpoint: `/groups/${args.groupId}/groupVolume`, body: { volume: args.volume.toString() } })
    .then(result => console.log('Setting Volume result', result))

  xapi.Command.UserInterface.Extensions.Widget.UnsetValue({ WidgetId: `${panelId}-toggleMute` })
}


/**
 * Sets Player Group to either Mute or Un-Muted
 * @property {object}   args          - Arguments Object
 * @property {string}   args.groupId  - SONOS Player Group Id
 * @property {boolean}  args.muted    - muted state - true | false
 */
function setMute(args) {
  if (!args || !(args.hasOwnProperty('groupId') || args.hasOwnProperty('muted'))) {
    throw new Error('setMute requires arguments object -  { groupId: "groupId", muted: true | false }');
  }
  console.log('Setting group Id:', args.groupId, 'to', args.muted ? 'muted' : 'unmuted')
  //REF:  POST  https://api.ws.sonos.com/control/api/v2/groups/groupId/groupVolume/mute
  return sonosAPI({ method: 'POST', endpoint: `/groups/${args.groupId}/groupVolume/mute`, body: { muted: args.muted } })
}

/**
 * Gets Sonos Player Group volume state
 * @property {object}  args             - Arguments Object
 * @property {string}  args.groupId     - Sonos Player Group Id
 */
async function getPlaylists(args) {
  if (!args || !args.hasOwnProperty('householdId')) {
    throw new Error('getPlaylists requires arguments object -  { householdId: "householdId" }');
  }
  console.log('Getting Playlists for Household Id: ', args.householdId)
  const result = await sonosAPI({ method: 'GET', endpoint: `/households/${args.householdId}/playlists` })

  const foundPlaylists = result?.playlists ?? []

  console.log('Playlists found:', foundPlaylists.length)

  return foundPlaylists
}


/**
 * Gets Sonos Player Group volume state
 * @property {object}  args             - Arguments Object
 * @property {string}  args.playlistId  - Sonos Playlist Id
 * @property {string}  args.groupId     - Sonos Player Group Id
 */
async function loadPlaylist(args) {
  if (!args || !(args.hasOwnProperty('groupId') && args.hasOwnProperty('playlistId'))) {
    throw new Error('loadPlaylist requires arguments object -  { groupId: "groupId", playlistId: "playlistId" }');
  }
  console.log('Loading Playlist ', args.playlistId, ' on Group Id: ', args.groupId)
  const body = { playlistId: args.playlistId, action: 'INSERT' }
  const result = await sonosAPI({ method: 'POST', endpoint: `/groups/${args.groupId}/playlists`, body })
  return result.playlists
  //REF: GET https://api.ws.sonos.com/control/api/v2/groups/${args.groupId}/playlists \
}


function getMetadataStatus(args) {
  if (!args || !args.hasOwnProperty('groupId')) {
    throw new Error('getMetadataStatus requires arguments object -  { groupId: "groupId" }');
  }

  return sonosAPI({ method: 'GET', endpoint: `/groups/${args.groupId}/playbackMetadata` })
}


/**
 * This function makes API requests to the Sonos Controls API using stored Access Token
 * @property {object}  args             - Arguments Object
 * @property {string}  args.method      - HTTP Method - GET | POST | DELETE
 * @property {string}  args.endpoint    - SONOS Control API Endpoint
 */
async function sonosAPI(args) {
  if (!args || !(args.hasOwnProperty('method') || args.hasOwnProperty('endpoint'))) {
    throw new Error('sonosAPI requires arguments object - either { method: "GET" | "POST",  endpoint: "household }');
  }
  if (!auth) {
    throw new Error('Sonos Authorization Tokens missing');
  }

  if (checkIfExpired(auth.accessExpire)) {
    console.debug('Sonos Access Token has expired requesing new one')
    const data = await getAccessToken({ refreshToken: auth.refreshToken, refreshExpire: auth.refreshExpire })
    if (data) {
      saveData(data)
      auth = data;
    } else {
      throw new Error('Error while refreshing Access Token');
    }
  }

  const supportedMethods = ['GET', 'POST', 'DELETE']

  if (!supportedMethods.includes(args.method)) {
    throw new Error(`only the following methods are supported: ${supportedMethods}`);
  }


  const Header = ['accept: application/json', 'authorization: Bearer ' + auth.accessToken];
  const Url = 'https://api.ws.sonos.com/control/api/v1' + args.endpoint;

  let body = ''
  if (args.hasOwnProperty('body')) {
    Header.push('Content-Type: application/json')
    body = JSON.stringify(args.body)
  }

  console.debug('Sonos API Request - Type:', args.method, 'Url:', Url)
  console.debug('Sonos API Auth:', auth)
  console.debug('Sonos API Body:', body)

  if (args.method == 'POST') {
    return xapi.Command.HttpClient.POST({ Header, ResultBody: 'PlainText', Url }, body)
      .then(result => JSON.parse(result.Body))
      .catch(error => { console.log(error); return [] })

  } else {
    return xapi.Command.HttpClient[args.method]({ Header, ResultBody: 'PlainText', Url })
      .then(result => JSON.parse(result.Body))
      .catch(error => { console.log(error); return [] })
  }

}

/**
 * Loads data Object from Device
 */
async function loadData() {
  const result = await xapi.Command.UserInterface.Extensions.List({ ActivityType: 'Custom' })
  const panels = result.Extensions?.Panel;
  if (!panels) return
  const panelId = config.panelId + '-data';
  const match = panels.find(panel => panel.PanelId == panelId)
  if (!match) return
  const iconId = match?.CustomIcon?.Id;
  if (!iconId) return
  return JSON.parse(atob(Array.from(iconId).reverse().join("")));
}


/**
 * Saves data Object to Device
 * @property {object}   args  - Any JavaScript Object
 */
async function saveData(data) {
  const id = Array.from(btoa(JSON.stringify(data))).reverse().join("");
  const panel = `
    <Extensions><Panel><Order>99</Order><Location>Hidden</Location>
    <Name>SONOS</Name><CustomIcon><Id>${id}</Id></CustomIcon>
    </Panel></Extensions>`;
  const panelId = config.panelId + '-data';
  await xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: panelId }, panel);
}

/**
 * Checks if the given data string is currently expired
 */
function checkIfExpired(date) {
  return (new Date() > new Date(date))
}

/**
 * This function makes API requests to the SONOS Controls API using stored Access Token
 */
function createSelectPlaylistPanel() {
  const panelId = config.panelId;
  const playlistRows = playlists.map(playlist => {
    return `
      <Row>
        <Widget>
          <WidgetId>${panelId}-playlist-${playlist.id}-text</WidgetId>
          <Name>${playlist.name.replaceAll('&', '&amp;')}</Name>
          <Type>Text</Type>
          <Options>size=3;fontSize=normal;align=left</Options>
        </Widget>
        <Widget>
          <WidgetId>${panelId}-selectPlaylist-${playlist.id}</WidgetId>
          <Type>Button</Type>
          <Options>size=1;icon=play</Options>
        </Widget>
      </Row>`
  })

  return `
    <Page>
      <Name>Playlists</Name>
      <Row>
        <Widget>
          <WidgetId>${panelId}-playlist-choosetext</WidgetId>
          <Name>Press play to choose a playlist</Name>
          <Type>Text</Type>
          <Options>size=4;fontSize=small;align=left</Options>
        </Widget>
      </Row>
      ${playlistRows}
      <Row>
        <Widget>
          <WidgetId>${panelId}-controls</WidgetId>
          <Name>Back</Name>
          <Type>Button</Type>
          <Options>size=1</Options>
        </Widget>
        <Widget>
          <WidgetId>${panelId}-playlistSpacer</WidgetId>
          <Type>Spacer</Type>
          <Options>size=3</Options>
        </Widget>
      </Row>
      <Options>hideRowNames=1</Options>
      <PageId>${panelId}-playlists</PageId>
    </Page>`
}

/**
 * This function makes API requests to the SONOS Controls API using stored Access Token
 */
function createErrorPanel(message) {
  const panelId = config.panelId;
  const playlistRows = playlists.map(playlist => {
    return `
      <Row>
        <Widget>
          <WidgetId>${panelId}-playlist-${playlist.id}-text</WidgetId>
          <Name>${playlist.name.replaceAll('&', '&amp;')}</Name>
          <Type>Text</Type>
          <Options>size=3;fontSize=normal;align=left</Options>
        </Widget>
        <Widget>
          <WidgetId>${panelId}-selectPlaylist-${playlist.id}</WidgetId>
          <Type>Button</Type>
          <Options>size=1;icon=play</Options>
        </Widget>
      </Row>`
  })

  return `
    <Page>
      <Name>Sonos</Name>
      <Row>
        <Widget>
          <WidgetId>${panelId}-errorText</WidgetId>
          <Name>${message}</Name>
          <Type>Text</Type>
          <Options>size=4;fontSize=small;align=left</Options>
        </Widget>
      </Row>
      <Row>
        <Widget>
          <WidgetId>${panelId}-retry</WidgetId>
          <Name>Retry</Name>
          <Type>Button</Type>
          <Options>size=1</Options>
        </Widget>
        <Widget>
          <WidgetId>${panelId}-spacer</WidgetId>
          <Type>Spacer</Type>
          <Options>size=3</Options>
        </Widget>
      </Row>
      <Options>hideRowNames=1</Options>
    </Page>`
}

async function createSetupPanel() {
  const panelId = config.panelId;
  const setup = []
  const platform = await xapi.Status.SystemUnit.ProductPlatform.get()
  if (platform.includes('Desk') || platform.includes('Board')) setup.push('OSD')
  if (await checkForNavigators()) setup.push('Controller')

  let widgets = ''

  if (setup.length > 0) {
    widgets = setup.map(target => {
      const screen = target == 'OSD' ? 'Device' : 'Navigator'
      return `
            <Row>
              <Widget>
                <WidgetId>${panelId}-setup-${target}</WidgetId>
                <Name>Sign in with Sonos [${screen}]</Name>
                <Type>Button</Type>
                <Options>size=4</Options>
              </Widget>
            </Row>`;
    }).join("")
  } else {
    widgets = `
          <Row>
            <Widget>
              <WidgetId>${panelId}-text</WidgetId>
              <Name>This Device doesn't have an interface which can be used to sign into your Sonos account 🙁</Name>
              <Type>Text</Type>
              <Options>size=4;fontSize=normal;align=center</Options>
            </Widget>
          </Row>`;
  }

  return `
        <Page>
          <Name>Sonos</Name>
          <Row>
            <Widget>
              <WidgetId>${panelId}-text</WidgetId>
              <Name>First time setup</Name>
              <Type>Text</Type>
              <Options>size=3;fontSize=normal;align=center</Options>
            </Widget>
          </Row>
          ${widgets}
          <Options>hideRowNames=1</Options>
          <PageId>${panelId}-setup</PageId>
        </Page>`;
}


function createSelectGroupPanel() {
  const panelId = config.panelId;
  const filteredGroups = filterGroups(groups)
  const groupRows = filteredGroups.map(group => {
    const button = !group.available ? 
     `<Widget>
          <WidgetId>${panelId}-restrictedText-${group.id}</WidgetId>
          <Name>Restricted</Name>
          <Type>Text</Type>
          <Options>size=1;fontSize=small;align=center</Options>
        </Widget>`:
      `<Widget>
          <WidgetId>${panelId}-selectGroup-${group.id}</WidgetId>
          <Type>Button</Type>
          <Options>size=1;icon=plus</Options>
        </Widget>`;
        
    return `
      <Row>
        <Widget>
          <WidgetId>${panelId}-groupText-${group.id}</WidgetId>
          <Name>${group.name}</Name>
          <Type>Text</Type>
          <Options>size=3;fontSize=normal;align=left</Options>
        </Widget>
        ${button}
      </Row>`;
  })

  let backButton = ''

  if (selectedGroupId) {
    backButton = `
    <Row>
      <Widget>
        <WidgetId>${panelId}-controls</WidgetId>
        <Name>Back</Name>
        <Type>Button</Type>
        <Options>size=1</Options>
      </Widget>
      <Widget>
        <WidgetId>${panelId}-locationSpacer</WidgetId>
        <Type>Spacer</Type>
        <Options>size=3</Options>
      </Widget>
    </Row>`
  }

  return `
    <Page>
      <Name>Locations</Name>
      <Row>
        <Widget>
          <WidgetId>${panelId}-locationText</WidgetId>
          <Name>Press ⊕ to choose a location</Name>
          <Type>Text</Type>
          <Options>size=4;fontSize=small;align=left</Options>
        </Widget>
      </Row>
      ${groupRows}
      ${backButton}
      <Options>hideRowNames=1</Options>
      <PageId>${panelId}-locations</PageId>
    </Page>`;
}


function createControlsPanel() {
  const panelId = config.panelId;

  const locationName = selectedGroupName ?? 'No location selected';
  const title = playingTitle ?? ' ';
  const artist = playingArtist ?? '';

  //<Name>Title Loading..</Name>
  return `
    <Page>
    <Name>${title}</Name>
      <Row>
        <Widget>
          <WidgetId>${panelId}-artistText</WidgetId>
          <Name>${artist}</Name>
          <Type>Text</Type>
          <Options>size=4;fontSize=small;align=center</Options>
        </Widget>
      </Row>
      <Row>
        <Widget>
          <WidgetId>${panelId}-PreviousTrack</WidgetId>
          <Type>Button</Type>
          <Options>size=1;icon=fast_bw</Options>
        </Widget>
        <Widget>
          <WidgetId>${panelId}-playPause</WidgetId>
          <Type>Button</Type>
          <Options>size=1;icon=play_pause</Options>
        </Widget>
        <Widget>
          <WidgetId>${panelId}-NextTrack</WidgetId>
          <Type>Button</Type>
          <Options>size=1;icon=fast_fw</Options>
        </Widget>
      </Row>
      <Row>
        <Widget>
          <WidgetId>${panelId}-toggleMute</WidgetId>
          <Type>Button</Type>
          <Options>size=1;icon=volume_muted</Options>
        </Widget>
        <Widget>
          <WidgetId>${panelId}-volume</WidgetId>
          <Type>Slider</Type>
          <Options>size=3</Options>
        </Widget>
      </Row>
      <Row>
        <Widget>
          <WidgetId>${panelId}-openPlaylists</WidgetId>
          <Name>Playlists</Name>
          <Type>Button</Type>
          <Options>size=2</Options>
        </Widget>
        <Widget>
          <WidgetId>${panelId}-openGroups</WidgetId>
          <Name>Locations</Name>
          <Type>Button</Type>
          <Options>size=2</Options>
        </Widget>
      </Row>
      <Row>
        <Widget>
          <WidgetId>${panelId}-playlistText</WidgetId>
          <Name></Name>
          <Type>Text</Type>
          <Options>size=2;fontSize=small;align=left</Options>
        </Widget>
        <Widget>
          <WidgetId>${panelId}-locationText</WidgetId>
          <Name>${locationName}</Name>
          <Type>Text</Type>
          <Options>size=2;fontSize=small;align=right</Options>
        </Widget>
      </Row>
      <PageId>${panelId}-controls</PageId>
      <Options>hideRowNames=1</Options>
    </Page>`;
}

function identifyState(selectedState) {
  if (selectedState) return { state: selectedState }
  if (!auth) return { state: 'setup' }
  if (!households) return { state: 'error', message: 'No Households Discovered' }
  if (!groups) return { state: 'error', message: 'No Groups Discovered' }
  if (!selectedGroupId) return { state: 'openGroups' }
  return { state: 'controls' }
}


/*********************************************************
 * Create the UI Extension Panel and Save it to the Device
 **********************************************************/
async function createPanel(selectedState) {
  const panelId = config.panelId;

  let order = "";
  const orderNum = await panelOrder(panelId);
  if (orderNum != -1) order = `<Order>${orderNum}</Order>`;
  let page = '';

  // No Auth = Setup Start
  // No Household = Error
  // No Groups = Error
  // Groups & non-selected = Select Loctation
  // Groups & one selected = player controls
  // Player Controls & no active playlist = show nothing playing

  const detected = identifyState(selectedState)
  console.log('Creating Panel with state:', detected.state)
  switch (detected.state) {
    case 'error':
      console.log('error', detected.message)
      break;
    case 'setup':
      page = await createSetupPanel();
      break;
    case 'controls':
      page = createControlsPanel();
      break;
    case 'openGroups':
      page = createSelectGroupPanel()
      break;
    case 'openPlaylists':
      page = createSelectPlaylistPanel()
      break;
  }

  const panel = `
    <Extensions>
      <Panel>
        ${order}
        <Origin>local</Origin>
        <Location>ControlPanel</Location>
        <Icon>Media</Icon>
        <Name>Sonos</Name>
        <ActivityType>Custom</ActivityType>
        ${page}
      </Panel>
    </Extensions>`

  currentPage = detected.state;
  await xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: panelId }, panel)
    .catch(e => console.log('Error saving panel: ' + e.message))

}


/*********************************************************
 * Gets the current Panel Order if exiting Macro panel is present
 * to preserve the order in relation to other custom UI Extensions
 **********************************************************/
async function panelOrder(panelId) {
  const list = await xapi.Command.UserInterface.Extensions.List({ ActivityType: "Custom" });
  const panels = list?.Extensions?.Panel
  if (!panels) return -1
  const existingPanel = panels.find(panel => panel.PanelId == panelId)
  if (!existingPanel) return -1
  return existingPanel.Order
}

/**
 * Checks if there are any Paired Navigators in Controller Mode
 */
async function checkForNavigators() {
  const connected = await xapi.Status.Peripherals.ConnectedDevice.get();
  if (!connected) return false
  return connected.some(device =>
    device.Status == 'Connected' &&
    device.Type == 'TouchPanel' &&
    device.Name.endsWith('Navigator')
  )
}
