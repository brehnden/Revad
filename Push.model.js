var mongoose = require('mongoose');
//var paypal = require('paypal-rest-sdk');
var Schema = mongoose.Schema;

var PushSchema = new Schema({
  aps: {
    alert: {
      body: String
    }
  }
})

module.exports = mongoose.model('Push',PushSchema);
