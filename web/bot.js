import Vue from 'vue'
import BotUI from 'botui'
import tweb3 from './tweb3'

const initWeb3 = async (showAlert = true) => {
  try {
    var resp = await tweb3.wallet.loadFromStorage('123', undefined, tweb3.wallet.defaultAccount)
    if (resp === 0) {
      window.alert('Wallet empty! Please go to Wallet tab to create account.')
      return
    }
    byId('address').textContent = tweb3.wallet.defaultAccount
    return true
  } catch (error) {
    console.error(error)
    const err = 'Please go to Wallet tab to create or import one first.'
    byId('address').textContent = err
    showAlert && window.alert(err)
    return false
  }
}
let web3Inited = initWeb3(false)

const queue = []
const botui = BotUI('my-botui-app', {
  vue: Vue
})

const say = (text, options) => {
  return botui.message.add(Object.assign({ content: String(text) }, options || {}))
}

/**
 * generate buttons
 * @param {string} action array of button title
 */
const sayButton = (action) => {
  if (!Array.isArray(action)) {
    action = [action]
  }
  return botui.action.button({ action })
}

const saySelect = (action) => {
  return botui.action.select({ action })
}

const speak = (items, updateIndex) => {
  if (!items) return
  if (!Array.isArray(items)) {
    items = [items]
  }
  if (!items.length) return

  // return the last item

  let isFirst = typeof updateIndex === 'number'
  return items.reduce((prev, item) => {
    const shouldUpdate = isFirst
    isFirst = false
    if (typeof item === 'string') {
      if (shouldUpdate) {
        return botui.message.update(updateIndex, {
          loading: false,
          content: item
        })
      } else {
        return say(item)
      }
    }

    item.type = item.type || 'text'
    switch (item.type) {
      case 'text':
      case 'html': {
        if (shouldUpdate) {
          return botui.message.update(updateIndex, Object.assign({
            loading: false
          }, item))
        } else {
          return botui.message.add(item)
        }
      }
      case 'input':
        return botui.action.text({
          action: item.content
        })
      case 'button':
        return sayButton(item.content)
      case 'select':
        return saySelect(item.content)
    }
  }, undefined)
}

/**
 * get element by id
 * @param {string} id element id
 */
function byId (id) {
  return document.getElementById(id)
}

function fmtMicroTea (n) {
  const tea = n / Math.pow(10, 6)
  return tea.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 9
  })
}

function confirmTransfer (amount) {
  say(`ATTENTION: you are about to transfer <b>${fmtMicroTea(amount)}</b> TEA to this bot.`, {
    type: 'html', cssClass: 'bot-confirm'
  })
  return sayButton([
    { text: 'Let\'s transfer', value: 'transfer' },
    { text: 'No way', value: 'no' }
  ]).then(result => (!!result && result.value === 'transfer'))
}

function confirmLocation () {
  say('Allow this bot to access your location?', {
    type: 'html', cssClass: 'bot-confirm'
  })
  return sayButton([
    { text: 'Yes', value: 'yes' },
    { text: 'No', value: 'no' }
  ]).then(result => (!!result && result.value === 'yes'))
}

function callContract (method, type, value, from, ...params) {
  if (value) {
    type = 'write'
  }
  const map = {
    none: 'callPure',
    read: 'call',
    write: 'sendCommit'
  }
  return method(...params)[map[type]]({ value, from }).then(r => type === 'write' ? r.returnValue : r)
}

async function getBotInfoFromStore (alias) {
  try {
    return await tweb3.contract('system.botstore').methods.query(alias)
  } catch {
    return {}
  }
}

async function getBotInfoFromBot (alias) {
  try {
    return await tweb3.contract(alias).methods.botInfo().callPure()
  } catch {
    return {}
  }
}

async function getBotInfo (alias) {
  return Object.assign(await getBotInfoFromBot(alias), await getBotInfoFromStore(alias))
}

function setCommands (commands, defStateAccess) {
  var t = byId('bot-menu-items')
  t.innerHTML = ''
  commands.forEach(c => {
    var a = document.createElement('A')
    a.href = '#'
    a.setAttribute('data-value', c.value)
    a.textContent = c.text || c.value
    t.appendChild(a)
    a.onclick = function () {
      closeNav()
      // botui.action.hide()
      say(c.text || c.value, { human: true })
      pushToQueue('command', c, c.stateAccess || defStateAccess)
    }
  })
}

function pushToQueue (type, content, stateAccess, transferValue, location, sendback) {
  if (content.value.indexOf(':') > 0) {
    const parts = content.value.split(':', 2)
    type = parts[0]
    content.value = parts[1]
  }
  queue.push({
    type,
    content,
    transferValue,
    location,
    sendback,
    stateAccess
  })
}

function isLocationRequest (cr, sr) {
  if (!cr || !cr.options) {
    return false
  }

  if (sr && sr.value && cr.options.next && cr.options.next[sr.value]) {
    const l = cr.options.next[sr.value].location
    if (l != null) {
      return !!l
    }
  }

  return !!cr.options.location
}

function processSpeakResult (contract, contractResult, speakResult) {
  // we not yet support setting both 'options.updateOnEvent' and 'options.value'
  if (contractResult.options && contractResult.options.updateOnEvent) {
    return new Promise((resolve, reject) => {
      contract.events[contractResult.options.updateOnEvent]({}, (error, value) => {
        if (error) {
          reject(error)
        } else {
          resolve(speak(value.messages || value, speakResult).then(r => processSpeakResult(contract, value, r)))
        }
      })
    })
  }

  if (typeof speakResult === 'object') {
    speakResult.sendback = contractResult.sendback
    speakResult.stateAccess = (contractResult.options || {}).nextStateAccess
  }

  if (contractResult.options && contractResult.options.value) {
    return confirmTransfer(contractResult.options.value).then(ok => {
      if (!ok) {
        say('Transfer canceled. You could reconnect to this bot to start a new conversation.')
        return sayButton({ text: 'Restart', value: 'command:start' })
      }

      speakResult.transferValue = contractResult.options.value
      return speakResult
    })
  } else if (isLocationRequest(contractResult, speakResult)) {
    return confirmLocation().then(ok => {
      if (!ok) {
        say('Location refused. You could reconnect to this bot to start a new conversation.')
        return sayButton({ text: 'Restart', value: 'command:start' })
      }

      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(function (p) {
          speakResult.location = { lat: p.coords.latitude, lon: p.coords.longitude }
          resolve(speakResult)
        }, function (e) {
          reject(e.message || String(e))
        }, {
          enableHighAccuracy: false,
          maximumAge: 1000 * 60 * 15
        })
      })
    })
  } else {
    return speakResult
  }
}

function handleQueue (contract, defStateAccess) {
  if (queue.length) {
    var item = queue.shift()
    callContract(contract.methods['on' + item.type],
      item.stateAccess,
      item.transferValue || 0,
      tweb3.wallet.defaultAccount,
      item.content.value,
      { sendback: item.sendback, locale: navigator.language, location: item.location })
      .then(contractResult => {
        return speak(contractResult.messages || contractResult)
          .then(r => processSpeakResult(contract, contractResult, r))
          .then(r => {
            if (r && r.value) {
              pushToQueue('text', r, r.stateAccess || defStateAccess, r.transferValue, r.location, r.sendback)
            }
          })
          .catch(err => {
            console.error(err)
            say('An error has occured: ' + err, { type: 'html', cssClass: 'bot-error' })
          })
      })
  }
}

/**
 * connect to bot smart contract
 * @param {string} botAddr bot smart contract address
 */
async function connectBot (botAddr) {
  if (!web3Inited) {
    web3Inited = initWeb3()
  }
  if (!web3Inited) return

  const contract = tweb3.contract(botAddr)

  // get bot info
  const botInfo = await getBotInfo(botAddr)
  const commands = botInfo.commands || [{
    text: 'Start',
    value: 'start',
    stateAccess: 'none'
  }]

  if (!botInfo.stateAccess) {
    const meta = await tweb3.getMetadata(botAddr)
    if (meta && meta.oncommand && meta.oncommand.decorators && meta.oncommand.decorators.length > 0) {
      const deco = meta.oncommand.decorators[0]
      if (deco === 'transaction' || deco === 'payable') {
        botInfo.stateAccess = 'write'
      } else if (deco === 'pure') {
        botInfo.stateAccess = 'none'
      } else {
        botInfo.stateAccess = 'read'
      }
    } else {
      botInfo.stateAccess = 'read'
    }
  } else if (!['read', 'write', 'none'].includes(botInfo.stateAccess)) {
    botInfo.stateAccess = 'read'
  }

  !botInfo.name && (botInfo.name = botAddr.split('.', 2)[1])
  !botInfo.description && (botInfo.description = 'No description.')

  botui.message.removeAll()

  setCommands(commands, botInfo.stateAccess)

  // display bot info
  await say(`<b>${botInfo.name}</b><br>${botInfo.description}`, { type: 'html', cssClass: 'bot-intro' })
  sayButton({ text: botInfo.startButtonText || 'Start', value: 'start' })
    .then(r => {
      pushToQueue('command', r, botInfo.stateAccess)
    })

  setInterval(function () {
    handleQueue(contract, botInfo.stateAccess)
  }, 100)
}

var getUrlParameter = function getUrlParameter (sParam) {
  var sPageURL = window.location.search.substring(1)
  var sURLVariables = sPageURL.split('&')
  var sParameterName
  var i

  for (i = 0; i < sURLVariables.length; i++) {
    sParameterName = sURLVariables[i].split('=')

    if (sParameterName[0] === sParam) {
      return sParameterName[1] === undefined ? true : decodeURIComponent(sParameterName[1])
    }
  }
}

function showBotOptionBtn () {
  var pane = byId('my-botui-app')
  var btn = byId('bot-option')
  var menu = byId('bot-menu')
  pane.prepend(menu, btn)

  byId('show-bot-option').addEventListener('click', function (e) {
    e.preventDefault()
    openNav()
  })

  byId('hide-bot-option').addEventListener('click', function (e) {
    e.preventDefault()
    closeNav()
  })
}

/* Set the width of the side navigation to 250px */
function openNav () {
  byId('bot-menu').style.width = '250px'
}

/* Set the width of the side navigation to 0 */
function closeNav () {
  byId('bot-menu').style.width = '0'
}

// do not remove this semicolon
; (async () => {
  showBotOptionBtn()
  var address = getUrlParameter('address')
  if (address) {
    try {
      address = await tweb3.ensureAddress(address)
      await connectBot(address)
    } catch (error) {
      console.log(error)
      window.alert(String(error))
    }
  } else {
    // window.alert('No bot to connect!')
  }
})()
