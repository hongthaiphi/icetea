import ecc from '../icetea/helper/ecc'
import Tx from '../icetea/Tx'
import { switchEncoding, parseParamList } from './utils'
import tweb3 from './tweb3'

export function fieldToBase64 (selector) {
  return switchEncoding(document.querySelector(selector).value.trim(), 'utf8', 'base64')
}

export function parseParamsFromField (selector) {
  return parseParamList(document.querySelector(selector).value.trim())
}

export function registerTxForm ($form, txData) {
  $form.submit(async function (e) {
    e.preventDefault()

    if (typeof txData === 'function') {
      txData = txData()
      if (!txData) return
    }
    txData = txData || {}

    var formData = $form.serializeArray().reduce(function (obj, item) {
      obj[item.name] = item.value
      return obj
    }, {})

    // console.log(txData)
    formData.data = JSON.stringify(txData)
    const privateKey = window.$('#private_key').val().trim()
    formData.from = ecc.toPublicKey(privateKey)
    var tx = new Tx(formData.from, formData.to, formData.value, formData.fee, txData)
    formData.nonce = tx.nonce
    formData.signature = ecc.sign(tx.signatureMessage, privateKey)

    // submit tx
    try {
      // Should send sync to catch check_tx error
      var result = await tweb3.sendTransactionSync(formData)
      window.location.href = '/tx.html?hash=' + result.hash
    } catch (error) {
      console.log(error)
      window.alert(String(error))
    }
  })
}
