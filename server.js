// เริ่มต้นด้วยการติดตั้ง package ที่จำเป็น
// npm install express body-parser request dotenv

// ไฟล์ .env
// PAGE_ACCESS_TOKEN=<your_page_access_token>
// VERIFY_TOKEN=<your_verify_token>
// ให้สร้าง VERIFY_TOKEN เป็นสตริงอะไรก็ได้ที่คุณตั้งเอง

// app.js
'use strict';

// นำเข้า module ที่จำเป็น
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
require('dotenv').config();

// สร้าง Express app
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// กำหนด port - Heroku จะกำหนด port เองหรือใช้ 5000 ถ้ารันบนเครื่องตัวเอง
const port = process.env.PORT || 5000;

// สร้าง endpoint สำหรับ webhook verification
app.get('/webhook', (req, res) => {
  // Facebook จะส่ง verify token มาตรวจสอบ
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  
  // เก็บค่าพารามิเตอร์จาก URL
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  // ตรวจสอบว่า token และ mode ถูกต้อง
  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      // ถ้าถูกต้อง ส่งค่า challenge กลับไป
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      // ถ้าไม่ถูกต้องส่ง 403 Forbidden
      res.sendStatus(403);
    }
  }
});

// สร้าง endpoint สำหรับรับข้อความ
app.post('/webhook', (req, res) => {
  const body = req.body;

  // ตรวจสอบว่าเป็น webhook event จาก Facebook page
  if (body.object === 'page') {
    // วนลูปผ่านแต่ละ entry - อาจมีหลาย entry ถ้ามีหลายข้อความ
    body.entry.forEach(entry => {
      // เก็บ webhook event
      const webhookEvent = entry.messaging[0];
      console.log(webhookEvent);

      // เก็บข้อมูลผู้ส่งข้อความ
      const senderPsid = webhookEvent.sender.id;
      console.log('Sender PSID: ' + senderPsid);

      // ตรวจสอบว่าเป็นข้อความเข้ามาหรือไม่
      if (webhookEvent.message) {
        handleMessage(senderPsid, webhookEvent.message);
      } else if (webhookEvent.postback) {
        // ถ้าเป็น postback (เช่นการกดปุ่ม)
        handlePostback(senderPsid, webhookEvent.postback);
      }
    });

    // ส่ง HTTP 200 กลับไปเพื่อยืนยันว่าได้รับข้อความแล้ว
    res.status(200).send('EVENT_RECEIVED');
  } else {
    // ถ้าไม่ใช่ event จาก page
    res.sendStatus(404);
  }
});

// ฟังก์ชันสำหรับจัดการข้อความที่ได้รับ
function handleMessage(senderPsid, receivedMessage) {
  let response;
  
  // ตรวจสอบว่ามีข้อความหรือไม่
  if (receivedMessage.text) {
    // สร้างข้อความตอบกลับ
    response = {
      'text': `คุณส่งข้อความ: "${receivedMessage.text}" มา. นี่คือข้อความตอบกลับอัตโนมัติ!`
    };
  } else if (receivedMessage.attachments) {
    // ถ้ามีไฟล์แนบ (รูปภาพ, วิดีโอ ฯลฯ)
    const attachmentUrl = receivedMessage.attachments[0].payload.url;
    response = {
      'attachment': {
        'type': 'template',
        'payload': {
          'template_type': 'generic',
          'elements': [{
            'title': 'นี่คือไฟล์แนบที่คุณส่งมาใช่ไหม?',
            'subtitle': 'กดปุ่มด้านล่างเพื่อตอบ',
            'image_url': attachmentUrl,
            'buttons': [
              {
                'type': 'postback',
                'title': 'ใช่!',
                'payload': 'yes',
              },
              {
                'type': 'postback',
                'title': 'ไม่ใช่!',
                'payload': 'no',
              }
            ],
          }]
        }
      }
    };
  }
  
  // ส่งข้อความตอบกลับ
  callSendAPI(senderPsid, response);
}

// ฟังก์ชันสำหรับจัดการ postback
function handlePostback(senderPsid, receivedPostback) {
  let response;
  
  // เก็บค่า payload ของ postback
  const payload = receivedPostback.payload;
  
  // ตอบกลับตาม payload ที่ได้รับ
  if (payload === 'yes') {
    response = { 'text': 'ขอบคุณที่ยืนยัน!' };
  } else if (payload === 'no') {
    response = { 'text': 'เข้าใจแล้ว มีอะไรให้ช่วยไหม?' };
  }
  
  // ส่งข้อความตอบกลับ
  callSendAPI(senderPsid, response);
}

// ฟังก์ชันสำหรับส่งข้อความกลับไปยัง Messenger
function callSendAPI(senderPsid, response) {
  // สร้าง request body
  const requestBody = {
    'recipient': {
      'id': senderPsid
    },
    'message': response
  };

  // ส่ง HTTP request ไปยัง Messenger Platform
  request({
    'uri': 'https://graph.facebook.com/v17.0/me/messages',
    'qs': { 'access_token': process.env.PAGE_ACCESS_TOKEN },
    'method': 'POST',
    'json': requestBody
  }, (err, res, body) => {
    if (!err) {
      console.log('ส่งข้อความสำเร็จ!');
    } else {
      console.error('ไม่สามารถส่งข้อความได้: ' + err);
    }
  });
}

// เริ่มต้น server
app.listen(port, () => {
  console.log(`Server กำลังทำงานที่ port ${port}`);
});