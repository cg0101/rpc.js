'use strict';

var net = require('net');

var idGenerator = function(a){
	return a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).
		replace(/[018]/g, idGenerator);
};

var log = {
	e: function(){
		var args = new Array(arguments.length);
		for(var ai = 0, al = arguments.length; ai < al; ++ai){
			args[ai] = arguments[ai];
		}

		console.log(args);
	}
};

var descrCmd = '__D';
var resultCmd = '__R';
var errorCmd = '__E';

var newLineCode = '\n'.charCodeAt(0);

exports = module.exports = zRPC;

function zRPC(wrapper, logger){
	if(!(this instanceof zRPC)) {
		return new zRPC(wrapper, logger);
	}

	log = logger || log;

	this.wrapper = wrapper;
	this.description = {};
	this.callbacks = {};

	for(var p in wrapper){
		this.description[p] = {};
	}

	this.descrStr = command(descrCmd, this.description);
	return this;
}

zRPC.prototype.connect = function(port, host, callback){
	if(!callback){
		callback = host;
		host = 'localhost';
	}

	var connection = net.createConnection(port, host);
	var self = this;

	connection.setKeepAlive(true);

	connection.on('connect', function(){
		connection.write(command(descrCmd));
	});

	var commandsCallback = function(cmd){
		console.log('---- commandsCallback start -----');
		console.log(cmd.data.args)
		console.log('---- commandsCallback end -----');
		if(cmd.command === resultCmd){
			console.log('---- remoteObj resultCmd start ------')
			console.log(self.callbacks) //这个是 { '12c6e261-2a57-430b-8ad1-9bccddb1c8db': [Function (anonymous)] }
			console.log('---- remoteObj resultCmd  end ------')
			if(self.callbacks[cmd.data.id]){
				self.callbacks[cmd.data.id].apply(this, cmd.data.args);
				delete self.callbacks[cmd.data.id];
			}
		}
		else if(cmd.command === errorCmd){
			if(self.callbacks[cmd.data.id]){
				self.callbacks[cmd.data.id].call(this, cmd.data.err);
				delete self.callbacks[cmd.data.id];
			}
		}
		else if(cmd.command === descrCmd){
			var remoteObj = {};

			for(var p in cmd.data){
				console.log('----  getRemoteCallFunction ---- ');
				console.log(self.callbacks)
				remoteObj[p] = getRemoteCallFunction(p, self.callbacks, connection);
			}
			console.log('----  callback remoteObj start  ---- ');
			console.log(descrCmd)
			console.log(remoteObj)
			console.log('----  callback remoteObj end ---- ');
			callback(remoteObj, connection);
		}
	};

	var lengthObj = {
		bufferBytes: undefined,
		getLength: true,
		length: -1
	};

	connection.on('data', getOnDataFn(commandsCallback, lengthObj));
	connection.on('error', function(err){
		log.e('CONNECTION_DAMN_ERROR', err);
	});

	connection.on('timeout', function(){
		log.e('RPC connection timeout');
	});

	connection.on('end', function(){
		log.e('RPC connection other side send end event');
	});
};

zRPC.prototype.listen = function(port){
	this.getServer();
	this.server.listen(port);
};

zRPC.prototype.getServer = function(){
	var self = this;
	//创建 server
	var server = net.createServer(function(c) {
		var commandsCallback = function(cmd){
			if(cmd.command === descrCmd){
					c.write(self.descrStr);
			}
			else if(!self.wrapper[cmd.command]){
				c.write(command('error', {code: 'UNKNOWN_COMMAND'}));
			}
			else {
				var args = cmd.data.args;
				args.push(getSendCommandBackFunction(c, cmd.data.id));

				try{
					self.wrapper[cmd.command].apply({}, args);
				}
				catch(err){
					log.e(err);

					var resultCommand = command(errorCmd, {id: cmd.data.id, err: err});
					c.write(resultCommand);
				}
			}
		};

		var lengthObj = {
			bufferBytes: undefined,
			getLength: true,
			length: -1
		};

		c.on('data', getOnDataFn(commandsCallback, lengthObj));

		c.on('error', function(exception){
			log.e(exception);
		});
	});

	this.server = server;
	return server;
};

zRPC.prototype.close = function(){
	this.server.close();
};

zRPC.connect = function(){
	var rpc = new zRPC();
	return rpc.connect.apply(rpc, arguments);
};

function command(name, data){
	var cmd = {
		command: name,
		data: data
	};

	var cmdStr = JSON.stringify(cmd);
	return Buffer.byteLength(cmdStr) + '\n' + cmdStr;
}

function getOnDataFn(commandsCallback, lengthObj){
	//当有数据响应式时，进行data解析
	return function(data){
		console.log(`------ getOnDataFn -----`)
		console.log(data)
		if(lengthObj.bufferBytes && lengthObj.bufferBytes.length > 0){
			var tmpBuff = new Buffer(lengthObj.bufferBytes.length + data.length);

			lengthObj.bufferBytes.copy(tmpBuff, 0);
			data.copy(tmpBuff, lengthObj.bufferBytes.length);

			lengthObj.bufferBytes = tmpBuff;
		} else {
			lengthObj.bufferBytes = data;
		}
		
		var commands = getComands.call(lengthObj);
		
		console.log(commands)
		commands.forEach(commandsCallback);
	};
}
//获取远程函数
function getRemoteCallFunction(cmdName, callbacks, connection){
	//返回一个函数
	return function(){
		var id = idGenerator();

		if(typeof arguments[arguments.length - 1] === 'function'){
			callbacks[id] = arguments[arguments.length - 1]; // fill函数
			console.log('----- fill function ----');
			console.log(arguments)
		}

		var args = [];
		for(var ai = 0, al = arguments.length; ai < al; ++ai){
			if(typeof arguments[ai] !== 'function'){
				args.push(arguments[ai]);
			}
		}

		var newCmd = command(cmdName, {id: id, args: args});
		// console.log('newCmd');
		// console.log(newCmd)
		//服务端消化
		connection.write(newCmd);
	};
}

function getSendCommandBackFunction(connection, cmdId){
	return function(){
		var innerArgs = [];

		for(var ai = 0, al = arguments.length; ai < al; ++ai){
			if(typeof arguments[ai] !== 'function'){
				innerArgs.push(arguments[ai]);
			}
		}

		var resultCommand = command(resultCmd, {id: cmdId, args: innerArgs});
		connection.write(resultCommand);
	};
}
//从 client 获取 server 的函数执行
function getComands(){
	var commands = [];
	var i = -1;

	var parseCommands = function(){
		if(this.getLength === true){
			i = getNewlineIndex(this.bufferBytes);
			if(i > -1){
				this.length = Number(this.bufferBytes.slice(0, i).toString());
				this.getLength = false;
				// (i + 1) for \n symbol
				this.bufferBytes = clearBuffer(this.bufferBytes, i + 1);
			}
		}

		if(this.bufferBytes && this.bufferBytes.length >= this.length){
			var cmd = this.bufferBytes.slice(0, this.length).toString();
			this.getLength = true;

			try{
				
			
				var parsedCmd = JSON.parse(cmd);
				
			}
			catch(e){
				log.e('ERROR PARSE');
				log.e(cmd);
				log.e(this.length, this.bufferBytes.toString());
				return;
			}
			// console.log('parsedCmd single')
			// console.log(parsedCmd.data.args)
			commands.push(parsedCmd);
			this.bufferBytes = clearBuffer(this.bufferBytes, this.length);
			
			if(this.bufferBytes && this.bufferBytes.length > 0){
				parseCommands.call(this);
			}
		}
	};

	parseCommands.call(this);
	// console.log('parsedCmd commands')
	// console.log(commands)
	return commands;
}

function getNewlineIndex(buffer){
	if(buffer){
		for(var i = 0, l = buffer.length; i < l; ++i){
			if(buffer[i] === newLineCode){
				return i;
			}
		}
	}

	return -1;
}

function clearBuffer(buffer, length){
	if(buffer.length > length){
		return buffer.slice(length);
	}

	return undefined;
}
