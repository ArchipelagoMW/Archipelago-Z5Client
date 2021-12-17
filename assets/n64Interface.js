const activeRequests = {};

window.addEventListener('load', () => {
  window.oot.requestComplete((requestId, ...args) => {
    if (activeRequests.hasOwnProperty(requestId)) {
      activeRequests[requestId](...args);
      delete activeRequests[requestId];
    }
  });
});

// Generate a requestId, and make sure it doesn't overwrite a current requestId
const generateRequestId = () => {
  const requestId = Math.floor(Math.random() * 10000000000);
  if (activeRequests.hasOwnProperty(requestId)) {
    return generateRequestId();
  }
  return requestId;
};

/**
 * Save the resolution function to the map of activeRequests, and return its requestId
 * @param resolve
 * @returns {*|number} requestId
 */
const assignResolve = (resolve) => {
  // TODO: Maybe re-implement a timeout of like 60 seconds just for safety?
  const requestId = generateRequestId();
  activeRequests[requestId] = resolve;
  return requestId;
};

const getLocationChecks = () => new Promise((resolve) => {
  window.oot.getLocationChecks(assignResolve(resolve));
});

const setNames = (namesObj) => new Promise((resolve) => {
  window.oot.setNames(assignResolve(resolve), namesObj);
});

const getRomName = () => new Promise((resolve) => {
  window.oot.getRomName(assignResolve(resolve));
});

const getReceivedItemCount = () => new Promise((resolve) => {
  window.oot.getReceivedItemCount(assignResolve(resolve));
});

const isItemReceivable = () => new Promise((resolve) => {
  window.oot.isItemReceivable(assignResolve(resolve));
});

const receiveItem = (itemId) => new Promise((resolve) => {
  // AP must know of the requested item
  if (!apItemsById.hasOwnProperty(itemId)) {
    return window.logging.writeToLog(`AP has no such item (${itemId}).`);
  }

  // OoT must have the requested item
  if (!romItemsByName.hasOwnProperty(apItemsById[itemId])) {
    return window.logging.writeToLog(`OoT has no such item. (itemId: ${apItemsById[itemId]})`);
  }

  window.oot.receiveItem(assignResolve(resolve), romItemsByName[apItemsById[itemId]]);
});

const getCurrentGameMode = () => new Promise((resolve) => {
  window.oot.getCurrentGameMode(assignResolve(resolve));
});

const isGameComplete = () => new Promise((resolve) => {
  window.oot.isGameComplete(assignResolve(resolve));
});

const isDeathLinkEnabled = () => new Promise((resolve) => {
  window.oot.isDeathLinkEnabled(assignResolve(resolve));
});

const isLinkAlive = () => new Promise((resolve) => {
  window.oot.isLinkAlive(assignResolve(resolve));
});

const killLink = () => new Promise((resolve) => {
  window.oot.killLink(assignResolve(resolve));
});
