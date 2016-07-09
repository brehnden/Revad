var mongoose = require('mongoose');
//var paypal = require('paypal-rest-sdk');
var Schema = mongoose.Schema;

var UserSchema = new Schema({
  General: {
    email: String,
    interests: [String],
    location: [Number],
    device_token: String,
    zip: String,
    index: String
    //random: Number
  },
  PayPal: {
    recipient_type: String,
    amount: {
      value: String,
      currency: String
    },
    receiver: String,
    note: String,
    sender_item_id: String
  }
})

module.exports = mongoose.model('User',UserSchema);
