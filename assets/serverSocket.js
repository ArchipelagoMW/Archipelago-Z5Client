// noinspection JSBitwiseOperatorUsage

let itemsReceived = [];

// Track reconnection attempts
const maxReconnectAttempts = 10;
let preventReconnect = false;
let reconnectAttempts = 0;
let reconnectTimeout = null;
let lastServerAddress = null;

// Control variable for the n64 watcher. Contains an interval (see MDN: setInterval)
let n64Interval = null;
let n64IntervalComplete = true;

// Location Ids provided by the server
let checkedLocations = [];
let missingLocations = [];

let gameComplete = false;
const CLIENT_STATUS = {
  CLIENT_UNKNOWN: 0,
  CLIENT_READY: 10,
  CLIENT_PLAYING: 20,
  CLIENT_GOAL: 30,
};

// DeathLink tracking
let deathLinkEnabled = false;
const DEATH_LINK_COOLDOWN = 3000; // Milliseconds
let lastDeathLink = new Date().getTime();
const DEATH_LINK_ALIVE = 0;
const DEATH_LINK_KILLING = 1;
const DEATH_LINK_DEAD = 2;
let deathLinkState = DEATH_LINK_ALIVE;

/**
 * Returns a randomly chosen DeathLink message
 * @param playerName
 * @returns {string}
 */
const getRandomDeathLinkMessage = (playerName) => {
  const deathLinkMessages = [
    `${playerName} has died, and took you with them.`,
    `${playerName} has met with a terrible fate, and they felt like sharing.`,
    `${playerName} dug a grave big enough for everyone to share.`,
    `Oh look, everyone died! Blame ${playerName}.`,
    `Don't worry ${playerName}, nobody saw that. Because they're dead too.`,
    `Have you ever heard the tragedy of Darth ${playerName} the wise?`,
    `Death comes for us all. Because ${playerName} invited him.`,
    `Death-warps aren't an option right now, ${playerName}...`,
    `${playerName} used DeathLink! It's super-effective!`,
    `Run for your lives! ${playerName} is killing people!`,
    `Is ${playerName} throwing for content?`,
    `${playerName} took an arrow to the knee. Now, their adventuring days are over.`,
    `${playerName} has won a free trip to the title screen, and they invited some friends!`,
    `All ${playerName}'s base are belong to us.`,
    `It's dangerous to go alone, ${playerName}. Take everyone with you.`,
  ];

  return deathLinkMessages[Math.floor(Math.random() * (deathLinkMessages.length))];
};

window.addEventListener('load', async () => {
  // Handle server address change
  document.getElementById('server-address').addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') { return; }

    // If the input value is empty, do not attempt to reconnect
    if (!event.target.value) {
      preventReconnect = true;
      lastServerAddress = null;

      // If the socket is open, close it
      if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
        serverSocket.close();
        serverSocket = null;
      }

      // If the user did not specify a server address, do not attempt to connect
      return;
    }

    // User specified a server. Attempt to connect
    preventReconnect = false;
    await connectToServer(event.target.value);
  });
});

const connectToServer = async (address, password=null) => {
  if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
    serverSocket.close();
    serverSocket = null;
  }

  // n64 networking must always be reset before initiating a server connection
  // Clear the Lua request queue, stop n64 interval, reset flags
  if (n64Interval) { clearInterval(n64Interval); }
  n64Interval = null;
  n64IntervalComplete = true;
  Object.keys(activeRequests).forEach((key) => delete activeRequests[key]);

  // If there are no n64 devices available, do nothing
  if (!n64Connected) {
    window.oot.disconnectAllClients();
    return;
  }

  // If an empty string is passed as the address, do not attempt to connect
  if (!address) { return; }

  // This is a new connection attempt, no auth error has occurred yet
  serverAuthError = false;

  // Determine the server address
  let serverAddress = address;
  if (serverAddress.search(/^\/connect /) > -1) { serverAddress = serverAddress.substring(9); }
  if (serverAddress.search(/:\d+$/) === -1) { serverAddress = `${serverAddress}:${DEFAULT_SERVER_PORT}`;}

  // Store the last given password
  serverPassword = password;

  // Reset the array of items received on every connection. This prevents the client from accepting cheat items
  // multiple times in the case of an AP server reconnection.
  itemsReceived = [];

  // Attempt to connect to the server
  serverSocket = new WebSocket(`ws://${serverAddress}`);
  serverSocket.onopen = (event) => {};

  // Handle incoming messages
  serverSocket.onmessage = async (event) => {
    const commands = JSON.parse(event.data);
    for (let command of commands) {
      const serverStatus = document.getElementById('server-status');
      switch(command.cmd) {
        case 'RoomInfo':
          // Update sidebar with info from the server
          document.getElementById('server-version').innerText =
            `${command.version.major}.${command.version.minor}.${command.version.build}`;
          document.getElementById('forfeit-mode').innerText = permissionMap[command.permissions.forfeit];
          document.getElementById('remaining-mode').innerText = permissionMap[command.permissions.remaining];
          hintCost = Number(command.hint_cost);
          document.getElementById('points-per-check').innerText = command.location_check_points.toString();

          // Update the local cache of location and item maps if necessary
          if (!localStorage.getItem('dataPackageVersion') || !localStorage.getItem('dataPackage') ||
            command.datapackage_version !== localStorage.getItem('dataPackageVersion')) {
            requestDataPackage();
          } else {
            // Load the location and item maps into memory
            buildItemAndLocationData(JSON.parse(localStorage.getItem('dataPackage')));
          }

          // Get the rom name
          const romName = await getRomName();

          // Determine if DeathLink is enabled
          const deathLink = await isDeathLinkEnabled();
          if (deathLink && (parseInt(deathLink[0], 10) === 1)) {
            deathLinkEnabled = true;
          }

          // Include DeathLink tag if it is enabled in the ROM
          const tags = ['Z5Client'];
          if (deathLinkEnabled) { tags.push('DeathLink'); }

          // Authenticate with the server
          const connectionData = {
            cmd: 'Connect',
            game: 'Ocarina of Time',
            name: romName[0],
            uuid: getClientId(),
            tags,
            password: serverPassword,
            version: ARCHIPELAGO_PROTOCOL_VERSION,
          };
          serverSocket.send(JSON.stringify([connectionData]));
          break;

        case 'Connected':
          // Reset reconnection info
          reconnectAttempts = 0;

          // Store the reported location check data from the server. They are arrays of locationIds
          checkedLocations = command.checked_locations;
          missingLocations = command.missing_locations;

          // Set the hint cost text
          document.getElementById('hint-cost').innerText =
            (Math.round((hintCost / 100) * (checkedLocations.length + missingLocations.length))).toString();

          // Update header text
          serverStatus.classList.remove('disconnected');
          serverStatus.innerText = 'Connected';
          serverStatus.classList.add('connected');

          // Save the list of players provided by the server
          players = command.players;

          // Save information about the current player
          playerTeam = command.team;
          playerSlot = command.slot;

          // Write player names to ROM
          const romPlayerNames = {};
          players.forEach((player) => {
            romPlayerNames[player.slot] = player.alias;
          });
          await setNames(romPlayerNames);

          n64Interval = setInterval(async () => {
            // Do not run multiple intervals simultaneously
            if (!n64IntervalComplete) { return; }

            // Interval has started
            n64IntervalComplete = false;

            // Determine if the game is complete, and notify the server if that has not been done already
            if (!gameComplete) {
              const romGameComplete = await isGameComplete();
              if (parseInt(romGameComplete[0], 10) === 1) {
                // Notify AP server of game completion
                if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
                  gameComplete = true;
                  serverSocket.send(JSON.stringify([
                    {
                      cmd: 'StatusUpdate',
                      status: CLIENT_STATUS.CLIENT_GOAL,
                    }
                  ]));
                }
              }
            }

            // Check if Link is currently able to receive an item
            let itemReceivable = await isItemReceivable();
            itemReceivable = (parseInt(itemReceivable[0], 10) === 1);

            if (receiveItems) {
              // If link can receive an item, see if there are any items to send. This order is important because
              // we know if link is able to receive an item, the received items count will always be correct
              if (itemReceivable) {
                let receivedItemCount = await getReceivedItemCount();
                receivedItemCount = receivedItemCount[0];
                if (receivedItemCount < itemsReceived.length) {
                  await setNames(romPlayerNames);
                  await receiveItem(itemsReceived[receivedItemCount].item);
                }
              }
            }

            // Do not check locations if the title screen is loaded
            const gameMode = await getCurrentGameMode();
            if (!['Normal Gameplay', 'Cutscene', 'Paused'].includes(gameMode[0])) {
              n64IntervalComplete = true;
              return;
            }

            // Get location checks from OoT
            const romLocationsChecked = await getLocationChecks();

            // Look for new location checks
            let romLocationIndex = 0;
            let newLocationChecks = [];
            while (romLocationIndex < romLocationsChecked.length) {
              // If the location has been checked
              if (parseInt(romLocationsChecked[romLocationIndex+1], 10) === 1) {
                // If this check is present in missing locations, remove it
                if (missingLocations.includes(ootLocationsByName[romLocationsChecked[romLocationIndex]])) {
                  missingLocations.splice(missingLocations.indexOf(ootLocationsByName[romLocationsChecked[romLocationIndex]]),1);
                }

                // If this check is not present in checked locations, note it as a new check
                if (!checkedLocations.includes(ootLocationsByName[romLocationsChecked[romLocationIndex]])) {
                  newLocationChecks.push(ootLocationsByName[romLocationsChecked[romLocationIndex]]);
                }
              }
              romLocationIndex += 2;
            }

            // If there are new location checks, send them to the AP server
            if (newLocationChecks.length > 0) {
              sendLocationChecks(newLocationChecks);
            }

            // Determine if Link is currently dead
            const linkIsAlive = await isLinkAlive();

            // Useful boolean for logical purposes
            const linkIsDead = (parseInt(linkIsAlive[0], 10) === 0);

            // Check if DeathLink is enabled and Link is dead
            if (deathLinkEnabled) {
              if (linkIsDead) {
                if (
                  (deathLinkState === DEATH_LINK_ALIVE) && // Player was last known to be alive
                  ((lastDeathLink + DEATH_LINK_COOLDOWN) < new Date().getTime()) // Cooldown has passed
                ) {
                  // Send the DeathLink message
                  if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
                    // Set the state to DEAD before sending the message
                    deathLinkState = DEATH_LINK_DEAD;

                    // Determine the DeathLink message
                    const causeMessage = getRandomDeathLinkMessage(players.find((player) =>
                      (player.team === playerTeam) && (player.slot === playerSlot)).alias);

                    // Send the DeathLink signal
                    lastDeathLink = new Date().getTime();
                    serverSocket.send(JSON.stringify([{
                      cmd: 'Bounce',
                      tags: ['DeathLink'],
                      data: {
                        time: (lastDeathLink / 1000),
                        source: players.find((player) =>
                          (player.team === playerTeam) && (player.slot === playerSlot)).alias,
                        cause: causeMessage,
                      }
                    }]));
                    appendConsoleMessage(causeMessage);
                  }
                }

                // If the player is dead, the DeathLink state must reflect that
                deathLinkState = DEATH_LINK_DEAD;
              }

              if (!linkIsDead) {
                switch (deathLinkState) {
                  case DEATH_LINK_ALIVE:
                    // Do nothing, this is fine
                    break;

                  case DEATH_LINK_KILLING:
                    // Keep sending the kill signal if the player is supposed to be dead. This prevents bugs where
                    // sometimes players will end up with zero health, but still be alive
                    await killLink();
                    break;

                  case DEATH_LINK_DEAD:
                    // If the player is alive, DeathLink signals may be sent again
                    deathLinkState = DEATH_LINK_ALIVE;
                    break;
                }
              }
            }

            // Interval complete, allow a new run
            n64IntervalComplete = true;
          });
          break;

        case 'ConnectionRefused':
          serverStatus.classList.remove('connected');
          serverStatus.innerText = 'Not Connected';
          serverStatus.classList.add('disconnected');
          if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
            if (command.errors.includes('InvalidPassword')) {
              appendConsoleMessage(serverPassword === null ?
                'This server requires a password. Please use /connect [server] [password] to connect.' :
                'Your provided password is incorrect. Please try again.'
              );
            } else {
              appendConsoleMessage(`Error while connecting to AP server: ${command.errors.join(', ')}.`);
            }
            serverAuthError = true;
            serverSocket.close();
          }
          break;

        case 'ReceivedItems':
          // Save received items in the array of items to be sent to the n64, if they have not been sent already
          command.items.forEach((item) => {
            // Items from locations with id 0 or lower are special cases, and should always be allowed
            if (item.location <= 0) { return itemsReceived.push(item); }

            if (itemsReceived.find((ir) =>
              ir.item === item.item && ir.location === item.location && ir.player === item.player
            )) { return; }
            itemsReceived.push(item);
          });
          break;

        case 'RoomUpdate':
          // Update sidebar with info from the server
          if (command.hasOwnProperty('version')) {
            document.getElementById('server-version').innerText =
              `${command.version.major}.${command.version.minor}.${command.version.build}`;
          }

          if (command.hasOwnProperty('forfeit_mode')) {
            document.getElementById('forfeit-mode').innerText =
              command.forfeit_mode[0].toUpperCase() + command.forfeit_mode.substring(1).toLowerCase();
          }

          if (command.hasOwnProperty('remaining_mode')) {
            document.getElementById('remaining-mode').innerText =
              command.remaining_mode[0].toUpperCase() + command.remaining_mode.substring(1).toLowerCase();
          }

          if (command.hasOwnProperty('hint_cost')) {
            hintCost = Number(command.hint_cost);
            document.getElementById('hint-cost').innerText =
              (Math.floor((hintCost / 100) * (checkedLocations.length + missingLocations.length))).toString();
          }

          if (command.hasOwnProperty('location_check_points')) {
            document.getElementById('points-per-check').innerText = command.location_check_points.toString();
          }

          if (command.hasOwnProperty('hint_points')) {
            document.getElementById('hint-points').innerText = command.hint_points.toString();
          }
          break;

        case 'Print':
          appendConsoleMessage(command.text);
          break;

        case 'PrintJSON':
          appendFormattedConsoleMessage(command.data);
          break;

        case 'DataPackage':
          // Save updated location and item maps into localStorage
          if (command.data.version !== 0) { // Unless this is a custom package, denoted by version zero
            localStorage.setItem('dataPackageVersion', command.data.version);
            localStorage.setItem('dataPackage', JSON.stringify(command.data));
          }
          buildItemAndLocationData(command.data);
          break;

        case 'Bounced':
          // This command can be used for a variety of things. Currently, it is used for keep-alive and DeathLink.
          // keep-alive packets can be safely ignored

          // DeathLink handling
          if (
            command.hasOwnProperty('tags') && // If there are tags on this message
            command.tags.includes('DeathLink') && // If those tags include DeathLink
            deathLinkEnabled // If DeathLink is enabled
          ) {
            if (
              (deathLinkState === DEATH_LINK_ALIVE) && // The player was last known to be alive
              ((lastDeathLink + DEATH_LINK_COOLDOWN) < new Date().getTime()) // Cooldown has passed
            ) {
              // Update the DeathLink state and wait a split second
              deathLinkState = DEATH_LINK_KILLING;
              lastDeathLink = new Date().getTime();
              await new Promise((resolve) => setTimeout(resolve, 50));

              // Kill the player and print a message to the console informing the player of who is responsible
              killLink().then(() => {
                if (command.data.hasOwnProperty('cause') && command.data.cause) {
                  appendConsoleMessage(command.data.cause);
                  return;
                }
                appendConsoleMessage(getRandomDeathLinkMessage(command.data.source));
              });
            }
          }
          break;

        default:
          // Unhandled events are ignored
          break;
      }
    }
  };

  serverSocket.onclose = (event) => {
    const serverStatus = document.getElementById('server-status');
    serverStatus.classList.remove('connected');
    serverStatus.innerText = 'Not Connected';
    serverStatus.classList.add('disconnected');
    if (n64Interval) { clearInterval(n64Interval); }

    // If the user cleared the server address, do nothing
    const serverAddress = document.getElementById('server-address').value;
    if (preventReconnect || !serverAddress) { return; }

    // If the N64 device is not available, do nothing
    if (!n64Connected) { return; }

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    reconnectTimeout = setTimeout(() => {
      // Do not attempt to reconnect if a server connection exists already. This can happen if a user attempts
      // to connect to a new server after connecting to a previous one
      if (serverSocket && serverSocket.readyState === WebSocket.OPEN) { return; }

      // If the socket was closed in response to an auth error, do not reconnect
      if (serverAuthError) { return }

      // If reconnection is currently prohibited for any other reason, do not attempt to reconnect
      if (preventReconnect) { return; }

      // Do not exceed the limit of reconnection attempts
      if (++reconnectAttempts > maxReconnectAttempts) {
        appendConsoleMessage('Archipelago server connection lost. The connection closed unexpectedly. ' +
          'Please try to reconnect, or restart the client.');
        return;
      }

      appendConsoleMessage(`Connection to AP server lost. Attempting to reconnect ` +
        `(${reconnectAttempts} of ${maxReconnectAttempts})`);
      connectToServer(address);
    }, 5000);
  };

  serverSocket.onerror = (event) => {
    if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
      appendConsoleMessage('Archipelago server connection lost. The connection closed unexpectedly. ' +
        'Please try to reconnect, or restart the client.');
      serverSocket.close();
      if (n64Interval) { clearInterval(n64Interval); }
    }
  };
};

const getClientId = () => {
  let clientId = localStorage.getItem('clientId');
  if (!clientId) {
    clientId = (Math.random() * 10000000000000000).toString();
    localStorage.setItem('clientId', clientId);
  }
  return clientId;
};

const sendMessageToServer = (message) => {
  if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
    serverSocket.send(JSON.stringify([{
      cmd: 'Say',
      text: message,
    }]));
  }
};

const serverSync = () => {
  if (serverSocket && serverSocket.readyState === WebSocket.OPEN) {
    serverSocket.send(JSON.stringify([{ cmd: 'Sync' }]));
  }
};

const requestDataPackage = () => {
  if (!serverSocket || serverSocket.readyState !== WebSocket.OPEN) { return; }
  serverSocket.send(JSON.stringify([{
    cmd: 'GetDataPackage',
  }]));
};

const sendLocationChecks = (locationIds) => {
  locationIds.forEach((id) => checkedLocations.push(id));
  serverSocket.send(JSON.stringify([{
    cmd: 'LocationChecks',
    locations: locationIds,
  }]));
};

const buildItemAndLocationData = (dataPackage) => {
  Object.values(dataPackage.games).forEach((game) => {
    Object.keys(game.item_name_to_id).forEach((item) => {
      apItemsById[game.item_name_to_id[item]] = item;
    });

    Object.keys(game.location_name_to_id).forEach((location) => {
      apLocationsById[game.location_name_to_id[location]] = location;
    });
  });

  ootLocationsByName = dataPackage.games['Ocarina of Time'].location_name_to_id;
};
