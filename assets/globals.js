// Client version data
const CLIENT_VERSION = {
  state: 'Beta',
  major: 0,
  minor: 14,
  patch: 3,
};

const ARCHIPELAGO_PROTOCOL_VERSION = {
  major: 0,
  minor: 2,
  build: 4,
  class: 'Version',
};

// Archipelago server
const DEFAULT_SERVER_PORT = 38281;
let serverSocket = null;
let serverAuthError = false;
let serverPassword = null;

const permissionMap = {
  0: 'Disabled',
  1: 'Enabled',
  2: 'Goal',
  6: 'Auto',
  7: 'Enabled + Auto',
};

// Local client connection state
let n64Connected = false;

// Players in the current game, received from Connected server packet
let playerSlot = null;
let playerTeam = null;
let players = [];
let hintCost = null;

// Location and item maps, populated from localStorage
let apItemsById = {};
let apLocationsById = {};
let ootLocationsByName = {};

// The user has the option to pause receiving items
let receiveItems = true;

// Tracks if auto-scrolling is currently paused
let autoScrollPaused = false;