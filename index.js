"use strict";

var express = require('express');
var async = require('async')
var helmet = require('helmet');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var paypal = require('paypal-rest-sdk');
var User = require('./User.model');
var Business = require('./Business.model');
var Push = require('./Push.model');
var SavedAds = require('./SavedAds.model')
var path = require('path');
var apn = require('apn');
var multer = require('multer');

var app = express();

app.use(helmet())

var port = 4000;
//var port = 27017;
var db = 'mongodb://localhost/revaddb';
//var db = '162.243.86.162';
mongoose.connect(db);

//app.use(express.limit('50mb'));
app.use(bodyParser.json({}));
app.use(bodyParser.urlencoded({
  extended: true
}));

paypal.configure({
  'mode': 'live', //sandbox or live
  'client_id': 'AZaaTDAGYlu-RHCRxMOHN3_ZX4gqXXSokFjPubaP8dvyYVys14ZRnRI82b-dlNwpHcdGFeYbKMwpDrkl',
  'client_secret': 'EFU6p96mpxSCQKMX5mcxqTDj6PUz4u-zVCGm5vx9pJlMlFg9TjGu2nwR7OprezwwenjIqW2zRcN9472I'
});

//EDIT: add function here that finds all users within a zip code with similar interests,
//      display the amount of these users to the business owner. Business owner then
//      decides how many users the ad should be sent to. To pay the users, the total
//      amount must be split into groups of 500 (for loop?)

app.post('/api/gettotal',function(req,res) {
  //GET TOKENS HERE
  //Below query finds closest 500 people with same zip and interests
  var query = User.find({ 'General.zip' : req.body.zip, 'General.interests' : req.body.tyPe,
                          'General.location' : {$near:{$geometry:
    {type:"Point", coordinates:req.body.location}}}  }).limit(10000)
  query.exec(function(err,total) {
    if (err) {
      console.log(err)
    } else {
      res.send("" + total.length)
    }
  })
})

//Below gets savedAds by querying userEmail
app.post('/api/getsavedad', function(req, res) {
  console.log(req.body.userEmail)
  var query = SavedAds.find({ 'userEmail' : req.body.userEmail })
  query.exec(function(err,savedads) {
    if (err) {
      console.log(err)
    } else {
      res.json(savedads)
    }
  })
})

//Below gets paypal auth token

/*app.post({
    uri: "https://api.sandbox.paypal.com/v1/oauth2/token",
    headers: {
        "Accept": "application/json",
        "Accept-Language": "en_US",
        "content-type": "application/x-www-form-urlencoded"
    },
    auth: {
    'user': 'AZaaTDAGYlu-RHCRxMOHN3_ZX4gqXXSokFjPubaP8dvyYVys14ZRnRI82b-dlNwpHcdGFeYbKMwpDrkl',
    'pass': 'EFU6p96mpxSCQKMX5mcxqTDj6PUz4u-zVCGm5vx9pJlMlFg9TjGu2nwR7OprezwwenjIqW2zRcN9472I',
    // 'sendImmediately': false
  },
  form: {
    "grant_type": "client_credentials"
  }
}, function(error, response, body) {
    console.log(body);
});*/

app.post('/api/sendpayment', function(req,res) {
  //paypal pay user here

if (req.body.amount == 10) {

  var sender_batch_id = Math.random().toString(36).substring(9);

  var create_payout_json = {
      "sender_batch_header": {
          "sender_batch_id": sender_batch_id,
          "email_subject": "Revad Payment"
      },
      "items": [
          {
              "recipient_type": "EMAIL",
              "amount": {
                  "value": 10.00,
                  "currency": "USD"
              },
              "receiver": req.body.email,
              "note": "Thank you for using Revad!",
              "sender_item_id": "Revad Payment"
          }
      ]
  };

  paypal.payout.create(create_payout_json, function (error, payout) {
      if (error) {
          console.log(error.response);
          throw error;
      } else {
          console.log("Create Single Payout Response");
          console.log(payout);
          res.json(payout)
      }
  });
} else {
  console.log("User has not reached $10.00")
}

})

var tokens = [];
var paypalUsers = [];
//var random = Math.random()
//app.get('/api/sendPN',getTokens,push);
app.post('/api/sendPN',function(req,res) {
  //GET TOKENS HERE
  //Below query finds closest 500 people with same zip and interests
  var limit = 0;
  var query = User.find({ 'General.zip' : req.body.zip, 'General.interests' : req.body.tyPe,
                          'General.location' : { $near:{$geometry:
    {type:"Point", coordinates:req.body.location} , $maxDistance: 3000 }}  })
  query.exec(function(err,users) {
    if (err) {
      console.log(err)
      //res.end();
    } else {
      //console.log(users)
      tokens = [];
      paypalUsers = [];
      limit = req.body.limit
      
      var index, length;
      for (index = 0, length = limit; index < length; ++index) {
        //console.log(users[index].General.device_token);
        tokens.push(users[index].General.device_token);
        //console.log(users[index].PayPal)
        paypalUsers.push(users[index].PayPal)
      }

      console.log(tokens);

      var options = {
                cert: path.join('cert.pem'),
                key:  path.join('key.pem'),
                passphrase: 'Revad',
                production:false,
                port: 2195
      };

      var apnConnection = new apn.Connection(options);

      var note = new apn.Notification();
      note.retryLimit = 10;
      note.priority = 10;
      note.sound = "ping.aiff";
      note.alert = req.body.ad;
      note.category = "ad";
      note.payload = {
        "link": req.body.link,
        "adBody": req.body.ad
      }

      apnConnection.pushNotification(note,tokens);

      //res.send('Should have sent pn');

      // A submission action has completed. This just means the message was submitted, not actually delivered.
      apnConnection.on('completed', function(a) {
          console.log('APNS: Completed sending', a);
          //res.send('Successfully sent push notifications')
      });

      // A message has been transmitted.
      apnConnection.on('transmitted', function(notification, device) {
          console.log('APNS: Successfully transmitted message');
          res.send('Sent Push Notification')
      });

      // There was a problem sending a message.
      apnConnection.on('transmissionError', function(errorCode, notification, device) {
          var deviceToken = device.toString('hex').toUpperCase();

          if (errorCode === 8) {
              console.log('APNS: Transmission error -- invalid token', errorCode, deviceToken);
              // Do something with deviceToken here - delete it from the database?
          } else {
              console.error('APNS: Transmission error', errorCode, deviceToken);
          }
      });

      apnConnection.on('connected', function() {
          console.log('APNS: Connected');
      });

      apnConnection.on('timeout', function() {
          console.error('APNS: Connection timeout');
      });

      apnConnection.on('disconnected', function() {
          console.error('APNS: Lost connection');
      });

      apnConnection.on('socketError', console.log);
      //res.send('should have sent push')
      console.log('should have sent push')
    }

    /*var sender_batch_id = Math.random().toString(36).substring(9);

    var create_payout_json = {
      "sender_batch_header": {
        "sender_batch_id": sender_batch_id,
        "email_subject": "Payment from Revad"
      },
      "items": paypalUsers
    }

    paypal.payout.create(create_payout_json, function(error, payout) {
      if (error) {
        console.log(error.response)
        throw error;
      } else {
        console.log("Create Payout Response");
        console.log(payout);
      }
    })*/

  })

})

//Below gets all Users/Consumers
app.get('/api/users', function(req, res) {
  console.log('getting all users')

  //var array = [0,1,2,3,4,5,6,7,8,9,10]
  //var sliced1 = array.slice(0, 3);
  //var sliced2 = array.slice(14,500);
  //console.log(sliced1)
  //console.log(sliced2)
  User.find({})
  .exec(function(err, users) {
    if(err) {
      res.send('error occured')
    } else {
      //console.log(users);
      res.json(users);
    }
  })
})

//Below gets all Businesses
app.get('/api/businesses', function(req, res) {
  console.log('getting all businesses')
  Business.find({})
  .exec(function(err, businesses) {
    if(err) {
      res.send('error occured')
    } else {
      //console.log(users);
      res.json(businesses);
    }
  })
})

//Below shows all savedAds
app.get('/api/savedads', function(req, res) {
  console.log('getting all saved ads')
  SavedAds.find({})
  .exec(function(err, savedads) {
    if (err) {
      res.send('error getting saved ads')
    } else {
      res.json(savedads);
    }
  })
})

//Below posts a new User/Consumer
app.post('/api/users', function(req, res) {
  console.log(req.body)
  var newUser = new User();
  //newUser.General.email = req.body.General.email;
  newUser.General.email = req.body.General.email;
  newUser.General.interests = req.body.General.interests;
  newUser.General.location = req.body.General.location;
  newUser.General.device_token = req.body.General.device_token;
  newUser.General.zip = req.body.General.zip;
  newUser.General.index = req.body.General.index
  newUser.PayPal.recipient_type = req.body.PayPal.recipient_type;
  newUser.PayPal.amount.value = req.body.PayPal.amount.value;
  newUser.PayPal.amount.currency = req.body.PayPal.amount.currency;
  newUser.PayPal.receiver = req.body.PayPal.receiver;
  newUser.PayPal.note = req.body.PayPal.note;
  newUser.PayPal.sender_item_id = req.body.PayPal.sender_item_id;

  newUser.save(function(err, user) {
    if (err) {
      console.log(err)
    } else {
      console.log('User has been saved')
      res.send(user)
    }
  })
})

//Below posts a new Business
app.post('/api/businesses', function(req, res) {
  console.log(req.body)
  var newBusiness = new Business();

  newBusiness.name = req.body.name;
  newBusiness.type = req.body.type;
  newBusiness.website = req.body.website;
  newBusiness.location = req.body.location;
  newBusiness.zip = req.body.zip;
  newBusiness.index = req.body.index;

  newBusiness.save(function(err, business) {
    if (err) {
      console.log(err)
    } else {
      console.log('Business has been saved')
      res.send(business)
    }
  })
})

//Below saves an advertisement
app.post('/api/savedads', function(req, res) {
  var newSavedAd = new SavedAds();

  newSavedAd.adBody = req.body.adBody;
  newSavedAd.website = req.body.website;
  newSavedAd.userEmail = req.body.userEmail;

  newSavedAd.save(function(err, savedad) {
    if (err) {
      console.log(err)
      //res.send(err)
    } else {
      console.log('Ad has been saved')
      res.send(savedad)
    }
  })
})

//Below updates an existing User/Consumer
app.put('/api/users/:id', function(req, res) {
  User.findById(req.params.id, function(error, p) {
    if (!p) {
      console.log(error)
    } else {
      p.modified = new User();

      p.General.email = req.body.General.email;
      p.General.interests = req.body.General.interests;
      p.General.location = req.body.General.location;
      p.General.device_token = req.body.General.device_token;
      p.General.zip = req.body.General.zip;
      p.General.index = req.body.General.index;
      p.PayPal.recipient_type = req.body.PayPal.recipient_type;
      p.PayPal.amount.value = req.body.PayPal.amount.value;
      p.PayPal.amount.currency = req.body.PayPal.amount.currency;
      p.PayPal.receiver = req.body.PayPal.receiver;
      p.PayPal.note = req.body.PayPal.note;
      p.PayPal.sender_item_id = req.body.PayPal.sender_item_id;

      p.save(function(err, user) {
        if (err) {
          console.log(err)
        } else {
          console.log('User has been updated')
          res.send(user)
        }
      })
    }
  })
});

//Below updates an existing Business
app.put('/api/businesses/:id', function(req, res) {
  Business.findById(req.params.id, function(error, p) {
    if (!p) {
      console.log(error)
    } else {
      p.modified = new Business();

      p.name = req.body.name;
      p.type = req.body.type;
      p.website = req.body.website;
      p.location = req.body.location;
      p.zip = req.body.zip;
      p.index = req.body.index;

      p.save(function(err, business) {
        if (err) {
          console.log(err)
        } else {
          console.log('Business has been updated')
          res.send(business)
        }
      })
    }
  })
});

//Below deletes an existing User/Consumer
app.delete('/api/users/:id', function(req, res) {
  User.findOneAndRemove({
    _id: req.params.id
  }, function(err, user) {
    if(err) {
      res.send('error removing')
    } else {
      console.log(user);
      res.send('deleted user');
    }
  });
})

//Below deletes an existing Business
app.delete('/api/businesses/:id', function(req, res) {
  Business.findOneAndRemove({
    _id: req.params.id
  }, function(err, business) {
    if(err) {
      res.send('error removing')
    } else {
      console.log(business);
      res.send('deleted business');
    }
  });
})

//Below deletes a saved ad
app.delete('/api/savedads/:id', function(req, res) {
  SavedAds.findOneAndRemove({
    _id: req.params.id
  }, function(err, savedAd) {
    if (err) {
      console.log('error deleting')
    } else {
      console.log(savedAd);
      res.send('deleted ad');
    }
  })
})

app.listen(port,function() {
  console.log('app is listening on port ' + port);
});
