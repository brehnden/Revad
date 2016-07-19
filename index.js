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
var db = 'mongodb://localhost/revaddb';

mongoose.connect(db);

app.use(bodyParser.json({}));
app.use(bodyParser.urlencoded({
  extended: true
}));

var clientID, clientSecret
app.post('/api/getpaypalclient', function(req,res) {
  clientID = req.body.paypalClientID
  clientSecret = req.body.paypalClientPassword
  console.log(clientID)
  console.log(clientSecret)
  paypal.configure({
    'mode': 'sandbox', //sandbox or live
    'client_id': clientID,
    'client_secret': clientSecret
  });

  res.json(req.body.paypalClientID)
})

app.post('/api/gettotal',function(req,res) {
  //Below query finds closest 500 people with same zip and interests
  var query = User.find({ 'General.zip' : req.body.zip, 'General.interests' : req.body.tyPe,
                          'General.location' : {$near:{$geometry:
    {type:"Point", coordinates:req.body.location}}}  }).limit(1000)
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

app.post('/api/sendpayment', function(req,res) {
  //paypal pay user here

if (req.body.amount >= 0.05/*10*/) {

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
                  "value": req.body.amount,
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

app.post('/api/sendPN',function(req,res) {
  //GET TOKENS HERE
  //Below query finds closest 500 people with same zip and interests
  var limit
  var query = User.find({ 'General.zip' : req.body.zip, 'General.interests' : req.body.tyPe,
                          'General.location' : { $near:{$geometry:
    {type:"Point", coordinates:req.body.location} , $maxDistance: 3000 }}  }).limit(10000)
  query.exec(function(err,users) {
    if (err) {
      console.log(err)
    } else {
      //console.log(users)
      tokens = [];
      paypalUsers = [];
      limit = req.body.limit

      var index, length;
      for (index = 0, length = limit/*users.length*/; index < length; ++index) {
        //console.log(users[index].General.device_token);
        tokens.push(users[index].General.device_token);
        //console.log(users[index].PayPal)
        paypalUsers.push(users[index].PayPal)
      }

      console.log(tokens)

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

  })

})

//Below gets all Users/Consumers
app.get('/api/users', function(req, res) {
  console.log('getting all users')

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
