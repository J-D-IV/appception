'use strict';

var _ = require('lodash');
var zlib = require('zlib');
var fs = require('fs');
// var fstream = require('fstream');
var unzip = require('unzip');
var request = require('request');
var Projects = require('./projects.model');
var token = require('../../auth/github/passport');
var forEachAsync = require('forEachAsync').forEachAsync;

var GitHubApi = require("github");

var github = new GitHubApi({
    version: "3.0.0",
    debug: true
});


// get
github.authenticate({
    type: "oauth",
    key: process.env.GITHUB_ID,
    secret: process.env.GITHUB_SECRET
});


// Get list of projects
exports.index = function(req, res) {
  // console.log(req)
  var githubLogin = req.query.githubLogin;
  console.log('inside projects.index', githubLogin)

  github.repos.getFromUser({ user: githubLogin }, function(err, data) {
    if(err){  console.log("projects.controller.js: get all repos error", err); }
    console.log("projects.controller.js: get all repos success")
    return res.json(data)
  });

};

// Get a single projects files
exports.files = function(req, res) {
  console.log('inside projects.files')

  var githubLogin = req.query.githubLogin;
  var githubRepo = req.query.githubRepo;

  // Get the url for the requested repo zip archive
  github.repos.getArchiveLink({
    user: githubLogin,
    repo: githubRepo,
    archive_format: 'zipball'
    // archive_format: 'tarball'
  }, function(err, data) {
    if(err) {
      console.log('projects.controller.js: get files error', err)
    }
    console.log('projects.controller.js: get files success')

    var file = data.meta.location;

    // if we wanted to let users pick a different branch to look at we can change 'master' here
    file = file.replace(/:ref/g, 'master')

    var filePath = 'server/tempfiles/' + githubRepo + '.zip';

    // Download the zip file from the given url and write it to a temporary folder in the server. Then unzip the file and save the outcome to the same temp folder.
    request.get({
      url: file,
      encoding: null
    }, function(err, resp, body) {
      if(err) throw err;

      var results = [];
      var i = 0;

      fs.writeFile(filePath, body, function(err) {
        if(err) throw err;

        console.log("file written!");
        var r =fs.createReadStream(filePath)
          // unzip file
          .pipe(unzip.Parse())
              //for each item in the zipped file,
              // create an entry object that has path and content properties
            .on("entry", function (e) {
              results.push([]);
              var entry = {};
              entry.path = e.props.path;
              e.on("data", function (c) {
                entry.content = c.toString();
              })
              e.on("end", function () {
                results[i].push(entry);
                i++;
              })
            })
            // when we are done unzipping, return the results
            .on('close', function(){
              return res.send(results)
            })
      });
    });
  })
};


// Create a new repo
exports.newRepo = function(req, res) {
  console.log('inside server new repo')
  var githubLogin = req.query.githubLogin;
  var repoName = req.query.repoName;

  console.log('token.token', token.token)
  github.authenticate({
      type: "oauth",
      token: token.token
  });

  github.repos.create({
    name: repoName,
    auto_init: true
  }, function(err, res) {
    if(err) {
      console.log('projects.controller.js: create repo error', err, res)
    }else {
      console.log('projects.controller.js: create repo success')
      console.log('res: ', res)

      fs.readdir('server/api/projects/filetemplates/', function(err, files) {
        forEachAsync(files, function(next, fileTitle, index, array) {
          console.log('fileTitle', fileTitle);

          var stream = fs.createReadStream('server/api/projects/filetemplates/' + fileTitle, {
            encoding: 'base64'
          })

          var response = '';
          stream.on('data', function(chunk) {
            console.log('data for: ', fileTitle)
            response = response + chunk
          })

          stream.on('end', function() {
            console.log('end for: ', fileTitle)
            console.log('next: ', next)
            // exports.addFiletoRepo(githubLogin, repoName, fileTitle, 'Initial Commit for ' + fileTitle, response, next);

            // if(!committer) {
            var committer = {
                "name" : "appception",
                "email" : "appception@gmail.com"
              }
            // }

            github.repos.createFile({
              user: githubLogin,
              repo: repoName,
              path: fileTitle,
              message: 'Initial Commit for ' + fileTitle,
              content: response,
              committer: committer
            }, function(err, res) {
              if(err) {
                console.log('projects.controller.js: create file error', err, res)
              }else {
                console.log('projects.controller.js: create file success')
                console.log('res: ', res)
                next()
              }
            })

          })
        }).then(function() {
          console.log('All done!')
        })
      })
    }
  })
}


exports.addFiletoRepo = function(githubLogin, repoName, path, message, content, cb, committer) {
  console.log('cb: ', cb)
  if(!committer) {
    committer = {
      "name" : "appception",
      "email" : "appception@gmail.com"
    }
  }

  github.repos.createFile({
    user: githubLogin,
    repo: repoName,
    path: path,
    message: message,
    content: content,
    committer: committer
  }, function(err, res) {
    if(err) {
      console.log('projects.controller.js: create file error', err, res)
    }else {
      console.log('projects.controller.js: create file success')
      console.log('res: ', res)
      cb()
    }
  })
}

function handleError(res, err) {
  return res.send(500, err);
}