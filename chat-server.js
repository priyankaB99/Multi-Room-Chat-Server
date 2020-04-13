// Require the packages we will use:
var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs");

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
	
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
		
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);
// lobbyroom dictionary
let lobbyroom = {
    pwd:"",
    currUsers: [],
    blacklist: [],
    admin: ""
}
// Chatroom dictionary (name of chatroom = key, all info pertaining to that chatroom = value)
let chatrooms = {
    "Lobby": lobbyroom
}

// Set of all connections
let connections = new Set();

// Dictionary: key: socketID, val: username
let allUsers = {};

// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
    // This callback runs when a new Socket.IO connection is established.

    connections.add(socket);
    //triggered once someone closes out of their browser
    socket.once('disconnect', function() {
        connections.delete(socket);
        for (let room in chatrooms) {
            let userlist = chatrooms[room]['currUsers'];
            if (userlist.includes(allUsers[socket.id])) {
                chatrooms[room]['currUsers'].splice(userlist.indexOf(allUsers[socket.id]), 1);
            }
        }
        //send back to client side to remove friend
        io.sockets.emit("removeFriend",{requested_by:"all", otherUser:allUsers[socket.id] })
        delete allUsers[socket.id]; //delete socket
    });
    //triggered once someone reloads the site
    socket.once('reconnect', function() {
        for (let room in chatrooms) {
            let userlist = chatrooms[room]['currUsers'];
            if (userlist.includes(allUsers[socket.id])) {
                chatrooms[room]['currUsers'].splice(userlist.indexOf(allUsers[socket.id]), 1);
            }
        }
        //send back to client side to remove friend
        io.sockets.emit("removeFriend",{requested_by:"all", otherUser:allUsers[socket.id] })
        allUsers[socket.id] = ""; //reset username instead of deleting socket
    });
    //triggered once a user attempts to login with a nickname
    socket.on('add_user', function(data) {
        //check if the nickname is taken
        let valid = true;
        for (id in allUsers) {
            if (allUsers[id] == data["user"]) {
                valid = false;
            }
        }
        if (valid) { //if valid nickname, add user to server and go to client side to print relevant items
            allUsers[socket.id] = data["user"];
            chatrooms["Lobby"]['currUsers'].push(data["user"]);
            io.sockets.emit("successful_login",{})
            io.sockets.emit("show_rooms",{chatrooms:chatrooms})
            io.sockets.emit("print_users",{chatrooms: chatrooms})
        }
        else { 
            io.sockets.emit("invalid_nickname",{})
        }
    });
    //triggered once user logs out
    socket.on('logout_user', function(data) {
        for (let room in chatrooms) { //remove user from relevant lists
            let userlist = chatrooms[room]['currUsers'];
            if (userlist.includes(data["user"])) {
                chatrooms[room]['currUsers'].splice(userlist.indexOf(data["user"]), 1);
            }
        }
        //send back to client side to remove friend
        io.sockets.emit("removeFriend",{requested_by:"all", otherUser:allUsers[socket.id] })
        allUsers[socket.id] = ""; //reset username instead of deleting socket
    }); 
    //triggered once user adds new room
    socket.on('add_room', function(data) {
		const creator = data["creator"];
		const pword = data["password"];
		//create a new chatroom object 
		let chat_room = {
			pwd: pword,
			currUsers: [],
			blacklist: [],
			admin: creator
		}
		chatrooms[data['room_name']] = chat_room; //add room
		io.sockets.emit("show_rooms",{chatrooms:chatrooms})
    });
    //triggered when room admin wants to delete room
    socket.on('delete_room', function(data) {
        let room = data['room_to_delete'];
        let users = chatrooms[room].currUsers;
        for (user in users) {
            chatrooms["Lobby"].currUsers.push(users[user]);
        }
        //send all users back to lobby
        io.sockets.emit("send_to_lobby",{users: users, old_room:room})
        delete chatrooms[room];
    });
    //updates all room, users, and friends.
    socket.on('print_current_users_rooms', function(data) {
        io.sockets.emit("show_rooms",{chatrooms:chatrooms})
        io.sockets.emit("print_users",{chatrooms:chatrooms})
        io.sockets.emit("print_friends",{})
    });
    //triggered to check if requested room has a password
    socket.on('passwordExists', function(data) {
        //check if room is password protected
        if (chatrooms[data["new_room"]].pwd != null && chatrooms[data["new_room"]].pwd != '') {
            io.sockets.emit("checkPasswordExists",{exists:true, requested_by: data['currUser'], new_room:data["new_room"], blacklist: chatrooms[data["new_room"]].blacklist})
        }
        else {
            io.sockets.emit("checkPasswordExists",{exists:false, requested_by: data['currUser'], new_room:data["new_room"], blacklist: chatrooms[data["new_room"]].blacklist})
        }
    });
    //triggered to check entered password and add user to new room
	socket.on('sendToRoom', function(data) {
		if (data['exists']) { //if password exists for the room
			if (data['entered_pword'] != chatrooms[data["new_room"]].pwd)
			{
                io.sockets.emit("incorrect_pword",{requested_by: data['currUser'], chatrooms:chatrooms});
            }
            else {
                //update the new chatroom's currUsers field to reflect that this user is now in the chatroom
		        chatrooms[data["new_room"]].currUsers.push(data["currUser"]);
                //update the original chatroom's currUsers field to reflect that this user is no longer in the room
                let ogUsers = chatrooms[data["current_room"]].currUsers;
		        chatrooms[data["current_room"]].currUsers.splice(ogUsers.indexOf(data["currUser"]), 1);
                //send back to client side
                io.sockets.emit("display_new_room",{banned: false, requested_by: data['currUser'], new_room:data["new_room"], chatrooms:chatrooms})
            }
        }
        else {
            //update the new chatroom's currUsers field to reflect that this user is now in the chatroom
		    chatrooms[data["new_room"]].currUsers.push(data["currUser"]);
            //update the original chatroom's currUsers field to reflect that this user is no longer in the room
            let ogUsers = chatrooms[data["current_room"]].currUsers;
		    chatrooms[data["current_room"]].currUsers.splice(ogUsers.indexOf(data["currUser"]), 1);
		    //send back to client side
            io.sockets.emit("display_new_room",{banned: false, requested_by: data['currUser'], new_room:data["new_room"], chatrooms:chatrooms})
        }
    });
    //process text message
    socket.on('message_to_server', function(data) {
		// This callback runs when the server receives a new message from the client.
		console.log("message: "+data["message"]); // log it to the Node.JS output
		io.sockets.emit("message_to_client",{requested_by: data['currUser'], requested_room: data['currRoom'], message:data["message"], chatrooms:chatrooms}) // broadcast the message to other users
    });
    //Triggered when user direct messages another user, creates DM modal box
    socket.on('dmModal', function(data) {
		console.log("DMedUser: "+data["DMedUser"]); // log to the Node.JS output
		io.sockets.emit("dmModalWindow",{requested_by: data['currUser'], DMedUser:data["DMedUser"] }) // send message to other (DM'ed) user
    });
    //process direct text message
    socket.on('dm_to_server', function(data) {
        console.log("message: "+data["message"]); // log to the Node.JS output
		io.sockets.emit("dm_to_client",{requested_by: data['currUser'], DMedUser:data["DMedUser"], message:data["message"] }) // send message to other (DM'ed) user
    });
    //Triggered when user wants to ban another user
    socket.on('banUser', function(data) {
        if (data['temp']) { //if temporary, not blacklisted, but sent to a different room
            console.log("bannedUser: "+data["bannedUser"]);
            //send back to client side
            let new_room = "Lobby";
            chatrooms[new_room].currUsers.push(data["bannedUser"]);
            //update the original chatroom's currUsers field to reflect that this user is no longer in the room
            let ogUsers = chatrooms[data["current_room"]].currUsers;
		    chatrooms[data["current_room"]].currUsers.splice(ogUsers.indexOf(data["bannedUser"]), 1);
		    //send back to client side
            io.sockets.emit("display_new_room",{banned: true, requested_by: data["bannedUser"], new_room:new_room})
        }
        else { //if permanent, sent to a different room and blacklisted
            console.log("bannedUser: "+data["bannedUser"]);
            let new_room = "Lobby";
            chatrooms[new_room].currUsers.push(data["bannedUser"]);
            //update the original chatroom's currUsers field to reflect that this user is no longer in the room
            chatrooms[data["current_room"]].blacklist.push(data["bannedUser"]);
            let ogUsers = chatrooms[data["current_room"]].currUsers;
		    chatrooms[data["current_room"]].currUsers.splice(ogUsers.indexOf(data["bannedUser"]), 1);
		    //send back to client side
            io.sockets.emit("display_new_room",{banned: true, requested_by: data["bannedUser"], new_room:new_room})
        }
    });
    //Triggered when user requests to add or remove a friend
    socket.on('friendsList', function(data) {
        if (data['currentlyfriends']) {
            //send back to client side to remove friend
            io.sockets.emit("removeFriend",{requested_by:data["currUser"], otherUser:data["otherUser"] })
            // print friends list on client side
            io.sockets.emit("print_friends",{})
        }
        else {
            //send back to client side to request to add friend
            io.sockets.emit("friendRequest",{requested_by:data["currUser"], otherUser:data["otherUser"] })
        }
    });
    //Handles results of friend request
    socket.on('friend_request', function(data) {
        if (data['accepted']) {
            //send back to client side to add friend
            io.sockets.emit("confirmed_add_friend",{accepted: true, requested_by:data["requested_by"], otherUser:data["otherUser"] })
            // print friends list on client side
            io.sockets.emit("print_friends",{})
        }
        else {
            //send back to client side (friend request denied)
            io.sockets.emit("confirmed_add_friend",{accepted: false, requested_by:data["requested_by"], otherUser:data["otherUser"] })
        }
    });
    //Triggered when user requests to invite friend to a room
    socket.on('invite_friend', function(data) {
        //send back to client side to invite friend to room
        io.sockets.emit("send_invite",{currUser:data["currUser"], otherUser:data["otherUser"], currentRoom:data["currentRoom"] })
    });
    //Triggered if user is already in the room they were invited to join
    socket.on('already_in_room', function(data) {
        //send back to client side to alert original user that the user they invited is already in the room
        io.sockets.emit("print_already_in_room",{currUser:data["currUser"], otherUser:data["otherUser"] })
    });
    //Handles result of request to join room
    socket.on('join_request', function(data) {
        if (data['accepted']) {
            //update the new chatroom's currUsers field to reflect that this user is now in the chatroom
            chatrooms[data["currentRoom"]].currUsers.push(data["otherUser"]);
            //update the old chatroom's currUsers field to reflect that this user is no longer in the room
            let ogUsers = chatrooms[data["old_room"]].currUsers;
            chatrooms[data["old_room"]].currUsers.splice(ogUsers.indexOf(data["otherUser"]), 1);
            io.sockets.emit("print_joined_room",{accepted:true, currUser:data["currUser"], otherUser:data["otherUser"] })
            io.sockets.emit("display_new_room",{banned: false, requested_by: data["otherUser"], new_room:data["currentRoom"]})
        }
        else {
            io.sockets.emit("print_joined_room",{accepted:false, currUser:data["currUser"], otherUser:data["otherUser"] })
        }
    });

});

