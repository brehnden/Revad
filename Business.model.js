var mongoose = require('mongoose');
//var paypal = require('paypal-rest-sdk');
var Schema = mongoose.Schema;

var BusinessSchema = new Schema({
  name: String,
  type: String,
  website: String,
  //image: Buffer,
  location: Array,
  zip: String,
  index: String
})

module.exports = mongoose.model('Business',BusinessSchema);
