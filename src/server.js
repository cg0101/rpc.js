var RPC = require("./rpc.js");
var file = { test: "testObject" };
var port = 8082;

var rpc = new RPC({
    combine: function (a, b, callback) {
        console.log('combine',a, b)
        callback(a + b);
    },
    multiply: function (t, cb) {
        cb(t * 2);
    },
    getFile: function (cb) {
        cb(file);
    },
});

rpc.listen(port);
console.log('rpc server start at %s',port)