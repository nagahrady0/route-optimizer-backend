const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  // الباسورد بيتخزن مشفّر دايمًا (bcrypt hash)، مش نص عادي أبدًا
  passwordHash: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', UserSchema);
