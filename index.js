var sendRequest = require('request');
var iconv = require('iconv-lite');
var uuid = require('node-uuid');
var pkginfo = require('pkginfo')(module, 'version');

var _api = {
  login: '',
  password: '',
  url : 'https://sms.voxbone.com:4443/sms/v1/'
};

var _version = module.exports.version;

var Voxbone = function(opts) {
  _api.login = opts.apiLogin;
  _api.password = opts.apiPassword;
  if(typeof opts.url != 'undefined'){
    _api.url = opts.url;
  }  
};

Voxbone.prototype = {
    //Delivery Report constructor that passes parameters to the http sendSMSRequest request
   sendSMS: function(to, from, msg, fragref, dr, callback){
        var encoding = detectEncoding(msg, fragref);
        var fragLength = getFragLength(msg, encoding, fragref);
        var frag;
        var fragments = [];
        console.log('Encoding: '+encoding+' Frag Length: '+fragLength+' msg length: '+msg.length+' Frag Ref: '+fragref);
        if (msg.length > fragLength){
            while (msg.length > fragLength){
                fragments.push(msg.substring(0,fragLength));
                msg = msg.substring(fragLength);
                if (msg.length < fragLength){
                 fragments.push(msg);
                }
            }
        }else{
        fragments.push(msg);
        }
        console.log(fragments);
        if(fragments.length > 1){
            for (var i = 0; i < fragments.length; ++i) {
              frag = {frag_ref: fragref, frag_total:fragments.length, frag_num: i+1};
              var data ={from:from, msg:fragments[i], frag:frag, delivery_report:dr};
              request('POST',_api.url+to, data, callback);
            }
        }else{
            frag = null;
            var data = {from:from, msg:msg, frag:frag, delivery_report:dr};
            request('POST',_api.url+to, data, callback);
        }
    },

    //Generate a Frag Ref
    //Frag ref should be a value within [0-65535]
    createFragRef: function (){
        return Math.floor(Math.random() * 65535 );
    },

    //Generate a transaction ID
    createTransId: function (){
        var transid = uuid.v4();
        return transid;
    },

    //Delivery Report constructor that passes parameters to the http sendDeliveryRequest request
    sendDeliveryReport: function(transid, orig_destination, orig_from, delivery_status, status_code){
        var data = {orig_from:orig_from, delivery_status:delivery_status, status_code:status_code};
        request('PUT',_api.url+orig_destination+'/report/'+transid, data);
    }
};

function request(method,url, data, callback){
    var credentials = {
        login: _api.login,
        password: _api.password
    };
    var headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'VoxSMS - NPM '+_version
    };
    var auth = {
        'user': credentials.login,
        'pass': credentials.password,
        'sendImmediately': false
    };
    var options = {
        auth: auth,
        url: url,
        body: data,
        json: true,
        headers: headers,
        method: method.toUpperCase()
    };

    sendRequest(options,function (error, response, body) {
        if (data.frag === null) {
          response.body.final = true;
          response.body.frag_total = 1;
          response.body.frag_num = 1;
        } else if (data.frag.frag_total === data.frag.frag_num) {
          response.body.final = true;
          response.body.frag_total = data.frag.frag_total;
          response.body.frag_num = data.frag.frag_num;
        } else {
          response.body.final = false;
          response.body.frag_total = data.frag.frag_total;
          response.body.frag_num = data.frag.frag_num;
        }

        if (!error && (response.statusCode == 200 || response.statusCode == 202)) {
            console.log('[DEBUG]',method,url,'succeeded with HTTP status', response.statusCode);
            console.log('[DEBUG] response.body : ' + JSON.stringify(response.body));
        }else if (!error){
            console.log('[DEBUG]',method,url,'failed with HTTP status',response.statusCode);
            console.log('[DEBUG] response.body : ' + JSON.stringify(response.body));
        }else{
            console.log('[DEBUG] An error occured while sending the request.');
            console.log(error);
            console.log(body);
            console.log(response);
        }

        typeof callback === "function" && callback(error, response, body);
    });

}

function detectEncoding(msg, fragref){
    var encoding;
    //Prepare encoding message
    var buf_latin = iconv.encode(msg, 'ISO-8859-15');
    var latin = iconv.decode(buf_latin, 'ISO-8859-15');
    var buf_ucs2 = iconv.encode(msg, 'ucs-2');
    var ucs2 = iconv.decode(buf_ucs2, 'ucs-2');
    if(isGSMAlphabet(msg) == true){
        encoding = 'gsma';
    }else if(latin == msg){
          encoding = 'latin1';
    }else if(ucs2 == msg){
          encoding = 'ucs-2';
    } else{
        console.log('No idea what encoding this is.');
    }
    function isGSMAlphabet(text) {
        var regexp = new RegExp("^[A-Za-z0-9 \\r\\n@£$¥èéùìòÇØøÅå\u0394_\u03A6\u0393\u039B\u03A9\u03A0\u03A8\u03A3\u0398\u039EÆæßÉ!\"#$%&'()*+,\\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\\\\\[~\\]|\u20AC]*$");
        return regexp.test(text);
    }
    return encoding;
}
function getFragLength(msg, encoding, fragref){
    var maxchar;
    if (encoding == 'gsma'){
        if (msg.length <= 160){
            maxchar = 160;
        }else if (msg.length > 160 && fragref <= 255){
            maxchar = 153;
        }else if (msg.length > 160 && fragref > 255){
            maxchar = 152;
        }
    }else if (encoding == 'latin1'){
        if (msg.length <= 140){
            maxchar = 140;
        }else if (msg.length > 140 && fragref <= 255){
            maxchar = 134;
        }else if (msg.length > 140 && fragref > 255){
            maxchar = 133;
        }
    }else if (encoding == 'ucs-2'){
        if (msg.length <=70){
            maxchar = 70;
        }else if (msg.length > 70 && fragref <= 255){
            maxchar = 65;
        }else if (msg.length > 70 && fragref > 255){
            maxchar = 64;
        }
    }
    return maxchar;
}

module.exports = Voxbone;
