var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var SavedAdsSchema = new Schema({
  adBody: String,
  website: String,
  userEmail: String
})

module.exports = mongoose.model('SavedAds',SavedAdsSchema);
