  import http from "http"; 
  import { createHash } from "node:crypto";
  
  const PORT = 3232;

  const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'; 
  const MAXIMUM_SIXTEENBITS_INTEGER = 2 ** 16; // 0 to 65536
  const SEVEN_BITS_INTEGER_MARKER = 125;
  const SIXTEEN_BITS_INTEGER_MARKER = 126; 
  const SIXTFOUR_BITS_INTEGER_MARKER = 127;
  const MASK_KEY_BYTES_LENGTH = 4;
  const OPCODE_TEXT = 0x01;
  
//parseInt('10000000', 2)
  const FIRST_BIT = 128;

const server = http.createServer((request, response) => {
  response.writeHead(200);
  response.end('hi there!');

}).listen(3232, () => console.log(`running at:${PORT}`))

server.on('upgrade', onSocketUpgrade);

function onSocketUpgrade(req, socket, head) {
  const { 
    "sec-websocket-key": webSocketClientKey 
  } = req.headers;
 
  console.log(`${webSocketClientKey} connected!`);

  const headers = prepareHandeSakeHeaders(webSocketClientKey);
  
  socket.write(headers);
  socket.on('readable', () => onSocketReadable(socket));
};

function sendMessage(msg, socket){
  const data = prepareMessage(msg)
  socket.write(data)
};

function prepareMessage(message){
  const msg = Buffer.from(message);
  const messageSize = msg.length;
  let dataFrameBuffer;

  // 0x80 
  let firstByte = 0x80 | OPCODE_TEXT;

  if(messageSize <= SEVEN_BITS_INTEGER_MARKER){
    const bytes = [firstByte];
    dataFrameBuffer = Buffer.from(bytes.concat(messageSize));
  }
  else if(messageSize <= MAXIMUM_SIXTEENBITS_INTEGER){
    const offSetFourBytes = 4;
    const target = Buffer.allocUnsafe(offSetFourBytes);

    target[0] = firstByte;
    target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0; // just to know the mask.

    target.writeUInt16BE(messageSize, 2);
    dataFrameBuffer = target;

    //alloc 4 bytes
    // [0] - 128 + 1 - 10000001 fin + opcode  
    // [1] - 126 + 0 - payload length marker + mask indicator
    // [2] 0 - content length
    // [3] 171 - content length
    // [4 - ...] - the message itself
  }
  else {
    throw new Error('message too long buddy :|');
  }

  const totalLength = dataFrameBuffer.byteLength + messageSize;
  const dataFrameResponse = concat([dataFrameBuffer, msg], totalLength);

  return dataFrameResponse;
};

function concat(bufferList, totalLength){
  const target = Buffer.allocUnsafe(totalLength);
  let offSet = 0;

  for(const buffer of bufferList){
    target.set(buffer, offSet);

    offSet += buffer.length;
  };

  return target
};

function prepareHandeSakeHeaders(id){
 const acceptKey = createSocketAccept(id)
   const headers = [
     'HTTP/1.1 101 Switching Protocols',
     'Upgrade: websocket',
     'Connection: Upgrade',
     `Sec-Websocket-Accept: ${acceptKey}`,
     ''
   ].map(line => line.concat('\r\n')).join('');

  return headers;
};

function onSocketReadable(socket){
  socket.read(1);
  // 1 - 1 byte - 8bits
  const [markerAndPayloadLength] = socket.read(1);
  // because first bit is always 1 for client-to-server messages.
  // you can subtract one bit (128 or '10000000')
  // from this byte to get rid of the MASK bit. 
  const lentghIndicatorInBits = markerAndPayloadLength - FIRST_BIT;

  let messageLength = 0;
  if(lentghIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER){
    messageLength = lentghIndicatorInBits;
  }
  else if(lentghIndicatorInBits === SIXTEEN_BITS_INTEGER_MARKER){
    // unsigned, big-begian 16-bit integer [0 -16k] - 2 ** 16
    messageLength = socket.read(2).readUint16BE(0);
  }
  else {
    throw new Error("your message is too long! we don't handle 64-bit messages")
  };

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
  const encoded = socket.read(messageLength);
  const decoded = unmask(encoded, maskKey);
  const received = decoded.toString('utf8');
  const data = JSON.parse(received);
  
  console.log('message received!', data);
  const msg = JSON.stringify({
    message: data,
    at: new Date().toISOString()
  });
  sendMessage(msg, socket)
};

// (71).toString(2).padStart(8, "0")
// (53).toString(2).padStart(8, "0")
//0 0 1 1 0 1 0 1
//0 1 0 0 0 1 1 1
//0 1 1 1 0 0 1 0
function unmask(encodedBuffer, maskKey){
  const finalBuffer = Buffer.from(encodedBuffer);
  const fillWithEightZeros = t => t.padStart(8, "0");
  const toBynary = t => fillWithEightZeros(t.toString(2))
  const fromBinaryToDecimal = t => parseInt(toBynary(t), 2);
  const getCharFromBinary = t => String.fromCharCode(fromBinaryToDecimal(t));

  for(let index = 0; index < encodedBuffer.length; index++){
      finalBuffer[index] = encodedBuffer[index] ^ maskKey[index % MASK_KEY_BYTES_LENGTH];

      const logger = {
        unmaskingcalc: `${toBynary(encodedBuffer[index])} ^ ${toBynary(maskKey[index % MASK_KEY_BYTES_LENGTH])} = ${toBynary(finalBuffer[index])}`,
        decoded: getCharFromBinary(finalBuffer[index])
      }
      
    console.log(logger)
    };

  return finalBuffer;
};

function createSocketAccept(id){
  const shaum = createHash('sha1');
  shaum.update(id + WEBSOCKET_MAGIC_STRING_KEY); 

  return shaum.digest('base64');
};

//error handling to keep server on.
;
[
  "unhandleException",
  "unhandledRejection"
].forEach(event => 
  process.on(event, (err) => {
  console.error(`something bad happend!, event:${event}, msg:${err.stack || err}`); 
  })
);
