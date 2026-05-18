require('dotenv').config();
const mongoose = require('mongoose');

async function debugAudit() {
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI);
    const dbInstance = connection.connection.client.db('BPER');
    
    // Find the latest audit log for USERS_BULK_UPLOADED
    const logs = await dbInstance.collection('auditlogs')
      .find({ action: 'USERS_BULK_UPLOADED' })
      .sort({ createdAt: -1 })
      .limit(3)
      .toArray();
      
    console.log("Recent Bulk Upload Audit Logs:");
    console.log(JSON.stringify(logs, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debugAudit();
