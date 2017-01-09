var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs"),
	mime = require("mime"),
	SpotifyWebApi = require('spotify-web-api-node');
	howler = require("howler");
var spotifyApi = new SpotifyWebApi();


var app = http.createServer(function(req, resp){
 
	fs.readFile("client.html", function(err, data){
 
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});

});
app.listen(3456);
var users = [];
var groups = [];
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	//Message received when user creates a new user
	socket.on("createuser_to_server", function(data) {
		username = data["username"];
		password = data["password"];

		//if the username already exists then send to the client that the request failed
		for(key in users) {
			if(users[key]["username"] == username) {
				socket.emit("createuser_to_client", {"success":0, "username":username});
				return;
			}
		}
		var groupNames = [];
		for(key in groups) {
			groupNames.push(key);
		}
		users[socket.id] = {"username":username, "password":password};
		socket.emit("createuser_to_client", {"success":1, "username":username, "groupnames" : groupNames});
	});

	//Message received when user logs in
	socket.on("login_to_server", function(data) {
		username = data["username"];
		password = data["password"];

		for(key in users) {
			if(users[key]["username"] == username) {
				//If the user exists 
				if(users[key]["password"] == password) {
					var groupNames = [];
					for(key in groups) {
						groupNames.push(key);
					}
					socket.emit("login_to_client", {"success":1, "username":username, "groupnames" : groupNames});
					return;
				} else {
					socket.emit("login_to_client", {"success":2, "username":username});
					return;
				}
				
			}
		}
		socket.emit("login_to_client", {"success":0, "username":username});
	});

	socket.on("creategroup_to_server", function(data) {
		var host = data["username"];
		var name = data["name"];
		for(key in groups) {

			if(key == name) {
				socket.emit("creategroup_to_client", {"success" : 0});
				return;
			}
		}
		groups[name] = {"host" : socket.id, "members" : [], "playlist" : []}; 
		io.sockets.emit("creategroup_to_client", {"success" : 1, "name" : name});

	});

	socket.on("joingroup_to_server", function(data) {
		var user = data["username"];
		var group = data["name"];
		var currentGroup = data["currentgroup"];
		if(currentGroup != null) {
			var index = groups[currentGroup]["members"].indexof(socket.id);
			groups[currentGroup]["members"].splice(index, 1);
		}
		groups[group]["members"].push(socket.id);
		var currentMembers = [];
		for(member in groups[group]["members"]) {
			currentMembers.push(users[groups[group]["members"][member]]["username"]);
		}
		for(member in groups[group]["members"]) {
			io.to(groups[group]["members"][member]).emit("joingroup_to_client", {"username" : user, "users" : currentMembers, "group" : group});
		}
	});

	socket.on("search_to_server", function(data) {
		var query = data["query"];
		spotifyApi.searchTracks(query).then(function(data) {
			tracks = data.body.tracks.items;
			songs = [];
			for(track in tracks) {
				artistsList = []
				for(artist in tracks[track]["artists"]) {
					artistsList.push(tracks[track]["artists"][artist]["name"]);
				}
				songs.push({"id" : tracks[track]["id"], "url" : tracks[track]["preview_url"], "name" : tracks[track]["name"], "artist" : artistsList});

			}
	  		socket.emit("search_to_client", {"result" : songs});
  		}, function(err) {
    		console.error(err);
  		});
	});

	socket.on("vote_to_server", function(data) {
		var id = data["id"];
		var name = data["name"];
		var user = data["username"];
		var group = data["group"];
		var url = data["url"];
		var alreadyAdded = false;
		for(song in groups[group]["playlist"]) {
			if( groups[group]["playlist"][song]["id"] == id) {
				for(vote in groups[group]["playlist"][song]["votes"]) {
					if(groups[group]["playlist"][song]["votes"][vote] == user) {
						socket.emit("vote_to_client", {"success" : 0});
						return;
					}
				}

				alreadyAdded = true;
				groups[group]["playlist"][song]["votes"].push(user);
			}
		}
		if(!alreadyAdded) {
			groups[group]["playlist"].push({"name" : name, "url" : url, "id" : id, "votes" : [user]});
			io.to(groups[group]["host"]).emit("play_to_host", {"playlist" : groups[group]["playlist"]});
		} else {

		}
		for(member in groups[data["group"]]["members"]) {
		 	io.to(groups[group]["members"][member]).emit("vote_to_client", {"success" : 1, "username" : user, "playlist" : groups[data["group"]]["playlist"]});
		}
	});

	socket.on("unvote_to_server", function(data) {
		var id = data["id"];
		var name = data["name"];
		var user = data["username"];
		var group = data["group"];
		
		for(song in groups[group]["playlist"]) {
			if(groups[group]["playlist"][song]["id"] == id) {
				var index = groups[group]["playlist"][song]["votes"].indexOf(user);
				if (index > -1) {
    				groups[group]["playlist"][song]["votes"].splice(index, 1);
				}
			}
		}
		
		for(member in groups[group]["members"]) {
		 	io.to(groups[group]["members"][member]).emit("vote_to_client", {"success" : 1, "username" : user, "playlist" : groups[group]["playlist"]});
		}
	});

	socket.on("songend_to_server", function(data) {
		var id = data["id"];
		var group = data["group"];
		var user = data["user"];
		for(song in groups[group]["playlist"]) {
			if(groups[group]["playlist"][song]["id"] == id) {
				groups[group]["playlist"].splice(song, 1);
			}
		}
		io.to(groups[group]["host"]).emit("play_to_host", {"playlist" : groups[group]["playlist"]});
		for(member in groups[group]["members"]) {
		 	io.to(groups[group]["members"][member]).emit("vote_to_client", {"success" : 1, "username" : user, "playlist" : groups[group]["playlist"]});
		}

	});

});