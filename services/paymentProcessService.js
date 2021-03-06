'use strict';

var async = require('async');
var Q = require('q');
var http = require('http');
var keys = require('../config/keys');
var _ = require('underscore');
var crypto = require('crypto');
var request = require('request');
var pricingPlans = require('../config/pricingPlans.js')();

module.exports = function(){

  return {

    createThirdPartySale: function (appId, planId) {

        console.log("Create sale/charge card..");

        var _self = this;

        var deferred = Q.defer();  

        try{
          var user=null;
          var saleDocument;

          _createSaleInAnalytics(appId,{
            planId : planId
          }).then(function(){  
            console.log("Success on create sale from analyticsService");
            return global.projectService.updatePlanByAppId(appId,planId); 
          }).then(function(updatedProject){
            console.log("Updated project by planId in after create sale..");
            deferred.resolve(updatedProject);
          },function(error){
            console.log("Error on create sale..");
            deferred.reject(error);
          });

        }catch(err){
          global.winston.log('error',{"error":String(err),"stack": new Error().stack}); 
          deferred.reject(err)         
        }

        return deferred.promise;
    },

    createSale: function (userId,appId,dataObj) {

        console.log("Create sale/charge card..");

        var _self = this;

        var deferred = Q.defer();  

        try{
          var user=null;
          var saleDocument;

          global.userService.getAccountById(userId).then(function(userObj){
            console.log("User is retrieved for create sale..");
            user=userObj;

            dataObj.userId=userId;
            dataObj.userEmail=userObj.email;
            return _createSaleInAnalytics(appId,dataObj); 

          }).then(function(data){  
            console.log("Success on create sale from analyticsService");
            saleDocument=data;
            //Update Project with PlanId
            return global.projectService.updatePlanByAppId(appId,data.planId); 

          }).then(function(updatedProject){
            console.log("Updated project by planId in after create sale..");
            deferred.resolve(updatedProject);

            var notificationType="inform";
            var type="app-upgraded";
            var text="Your app <span style='font-weight:bold;'>"+updatedProject.name+"</span> has been upgraded to <span style='font-weight:bold;'>"+saleDocument.planName+"</span>.";
            global.notificationService.createNotification(appId,user._id,notificationType,type,text);            

            var mailName="changeplan";
            var emailTo=user.email;
            var subject="You've changed your app plan";

            var variableArray=[{
                "domClass": "username",
                "content": user.name,
                "contentType": "text"
            },{
                "domClass": "appname",
                "content": updatedProject.name,
                "contentType": "text"
            },{
                "domClass": "planname",
                "content": saleDocument.planName,
                "contentType": "text"
            }]; 

            global.mailService.sendMail(mailName, emailTo, subject, variableArray); 

          },function(error){
            console.log("Error on create sale..");
            deferred.reject(error);
          });

        }catch(err){
          global.winston.log('error',{"error":String(err),"stack": new Error().stack}); 
          deferred.reject(err)         
        }

        return deferred.promise;
    },

    
    stopRecurring: function (appId,userId) {

        console.log("Stop recurring...");

        var _self = this;

        var deferred = Q.defer(); 

        try{
          var project=null;

          global.projectService.getProject(appId).then(function(projectObj){

            console.log("Retrieved project for Stop recurring...");
            project=projectObj;

            return _stopRecurringInAnalytics(appId,userId);

          }).then(function(response){
            console.log("Stopped recurring from analyticsService");
            return global.projectService.updatePlanByAppId(appId,1);          

          }).then(function(updatedProject){

            console.log("updated project with planId after stopped recurring..");

            deferred.resolve({"message":"Success"});


            global.userService.getAccountById(userId).then(function(userObj){

              var previousPlan=_.first(_.where(pricingPlans.plans, {id: project.planId}));

              var notificationType="inform";
              var type="app-payment-stopped";
              var text="Your app <span style='font-weight:bold;'>"+updatedProject.name+"</span> has been cancelled for the <span style='font-weight:bold;'>"+previousPlan.planName+"</span>.";
              global.notificationService.createNotification(appId,userObj._id,notificationType,type,text);              

              var mailName="cancelplan";
              var emailTo=userObj.email;
              var subject="You've canceled your plan";

              var variableArray=[{
                    "domClass": "username",
                    "content": userObj.name,
                    "contentType": "text"
                },{
                    "domClass": "appname",
                    "content": updatedProject.name,
                    "contentType": "text"
                },{
                    "domClass": "planname",
                    "content": previousPlan.planName,
                    "contentType": "text"
                }]; 

              global.mailService.sendMail(mailName, emailTo, subject, variableArray); 

            },function(error){
              console.log("Error in getting User details after cancelling Plan");
            });  
            

          },function(error){
            console.log("Error on stop recurring..");
            deferred.reject(error);
          });

        }catch(err){
          global.winston.log('error',{"error":String(err),"stack": new Error().stack}); 
          deferred.reject(err)         
        }

        return deferred.promise;
    },
  }   

};


/***********************Pinging Analytics Services*********************************/

function _createSaleInAnalytics(appId,dataObj){

  console.log("Create Sale in Analytics");

  var deferred = Q.defer(); 

  try{
  
    dataObj.secureKey = global.keys.secureKey; 
    dataObj = JSON.stringify(dataObj);


    var url = global.keys.analyticsServiceUrl + '/'+appId+'/sale';  
    request.post(url,{
        headers: {
            'content-type': 'application/json',
            'content-length': dataObj.length
        },
        body: dataObj
    },function(err,response,body){
        if(err || response.statusCode === 500 || response.statusCode === 400 || body === 'Error'){  
          console.log("Error on Create Sale in Analytics");     
          deferred.reject(err);
        }else {   
          console.log("Success on Create Sale in Analytics"); 
          try{
            var respBody=JSON.parse(body);
            deferred.resolve(respBody);
          }catch(e){
            deferred.resolve();
          }
          
        }
    });

  }catch(err){
    global.winston.log('error',{"error":String(err),"stack": new Error().stack}); 
    deferred.reject(err)         
  }

  return deferred.promise;
}

function _stopRecurringInAnalytics(appId,userId){

  console.log("Stop recurring in Analytics");

  var deferred = Q.defer(); 
  
  try{
    var dataObj={};
    dataObj.secureKey = global.keys.secureKey; 
    dataObj.userId = userId;
    dataObj = JSON.stringify(dataObj);

    var url = global.keys.analyticsServiceUrl + '/'+appId+'/cancel'; 

    request.post(url,{
        headers: {
            'content-type': 'application/json',
            'content-length': dataObj.length
        },
        body: dataObj
    },function(err,response,body){
        if(err || response.statusCode === 500 || response.statusCode === 400 || body === 'Error'){
          console.log("Error stop recurring in Analytics");       
          deferred.reject(err);
        }else { 
          console.log("Success on stop recurring in Analytics");         
          try{
            var respBody=JSON.parse(body);
            deferred.resolve(respBody);
          }catch(e){
            deferred.reject(e);
          }
        }
    });

  }catch(err){
    global.winston.log('error',{"error":String(err),"stack": new Error().stack}); 
    deferred.reject(err)         
  }

  return deferred.promise;
}
