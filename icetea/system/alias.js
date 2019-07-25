/**
 * A registry mapping aliases (domains) to addresses.
 *
 * SIMPLE VERSION - WILL IMPROVE LATER
 *
 * Current version only allows register alias for your owned account/contract.
 * No support for UPDATE nor DELETE
 */

const { Alias: ALIAS_ADDR } = require('./botnames')
const { checkMsg } = require('../helper/types')

const METADATA = {
  'query': {
    decorators: ['view'],
    params: [
      { name: 'partOfAlias', type: ['string', 'RegExp'] }
    ],
    returnType: ['object', 'Array']
  },
  'resolve': {
    decorators: ['view'],
    params: [
      { name: 'alias', type: 'string' }
    ],
    returnType: 'string'
  },
  'byAddress': {
    decorators: ['view'],
    params: [
      { name: 'address', type: 'pureaddress' }
    ],
    returnType: 'Array'
  },
  'register': {
    decorators: ['transaction'],
    params: [
      { name: 'alias', type: 'string' },
      { name: 'address', type: 'pureaddress' },
      { name: 'overwrite', type: ['boolean', 'undefined'] }
    ],
    returnType: 'string'
  }
}

const ALIAS_KEY = 'alias'

const loadAliases = (context) => {
  return context.getState(ALIAS_KEY, {})
}

const saveAliases = (context, aliases) => {
  return context.setState(ALIAS_KEY, aliases)
}

const isSatisfied = (text, condition) => {
  if (typeof condition.test === 'function') {
    return !!condition.test(text)
  } else if (typeof text.includes === 'function') {
    return !!text.includes(condition)
  }

  return text == condition // eslint-disable-line
}

const sanitizeAlias = (alias) => {
  alias = alias.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{1,61}[a-z0-9](?:\.[a-z]{2,})*$/.test(alias)) {
    throw new Error(`Invalid alias '${alias}', make sure it does not contain invalid characters and has appropriate length.`)
  }
  return alias
}

// standard contract interface
exports.run = (context, options) => {
  const { msg, block } = context.runtime
  const msgParams = checkMsg(msg, METADATA, { sysContracts: this.systemContracts() })

  const contract = {
    query (textOrRegEx) {
      const aliases = loadAliases(context)

      return Object.keys(aliases).reduce((prev, alias) => {
        if (isSatisfied(alias, textOrRegEx)) {
          prev[alias] = aliases[alias]
        }
        return prev
      }, {})
    },

    resolve (alias) {
      const aliases = loadAliases(context)
      return (aliases[alias] || {}).address
    },

    byAddress (address) {
      const aliases = loadAliases(context)
      return Object.keys(aliases).filter(a => {
        return aliases[a].address === address
      })
    },

    register (alias, address, overwrite = false) {
      alias = sanitizeAlias(alias)
      if (alias.startsWith('system.') || alias.startsWith('account.') || alias.startsWith('contract.')) {
        throw new Error("Alias cannot start with 'system.', 'account.', or 'contract.'.")
      }

      let isOwnedAccount = false
      const validateAddressOwner = (address, owner) => {
        try {
          exports.systemContracts().Did.checkPermission(address, msg.signers, block.timestamp)
          isOwnedAccount = true
          return
        } catch (e) {
          // console.error('hic', e)
          let deployedBy
          try {
            deployedBy = options.tools.getCode(address).deployedBy
          } catch (e2) {
            throw new Error('You do not have permission to register this alias.')
          }

          if (deployedBy !== owner) {
            throw new Error('You do not have permission to register this alias.')
          }
        }
      }

      // this is not like DNS where anyone can map a domain to your address
      validateAddressOwner(address)

      const prefix = isOwnedAccount ? 'account.' : 'contract.'
      const fullAlias = prefix + alias

      const aliases = loadAliases(context)
      const oldAddress = aliases[fullAlias]
      if (oldAddress) {
        if (!overwrite) {
          throw new Error(`Alias ${fullAlias} already registered.`)
        } else {
          // need to check whether caller own this address before updating
          validateAddressOwner(oldAddress.address)
        }
      }

      aliases[fullAlias] = {
        address,
        by: msg.sender,
        blockNumber: block.number
      }

      saveAliases(context, aliases)

      return fullAlias
    }
  }

  if (!contract.hasOwnProperty(msg.name)) {
    return METADATA
  } else {
    return contract[msg.name].apply(context, msgParams)
  }
}

exports.resolve = function (alias) {
  const storage = this.unsafeStateManager().getAccountState(ALIAS_ADDR).storage || {}
  const aliases = storage[ALIAS_KEY] || {}
  return (aliases[alias] || {}).address
}

exports.ensureAddress = function (aliasOrAddress) {
  return exports.resolve(aliasOrAddress) || aliasOrAddress
}

exports.getAliases = function () {
  const storage = this.unsafeStateManager().getAccountState(ALIAS_ADDR).storage || {}
  return storage[ALIAS_KEY] || {}
}
