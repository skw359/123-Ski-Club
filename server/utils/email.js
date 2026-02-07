const nodemailer = require('nodemailer');
const { smtpConfig, FROM } = require('../config');

const transporter = nodemailer.createTransport(smtpConfig);

module.exports = {
  transporter,
  FROM,
};
