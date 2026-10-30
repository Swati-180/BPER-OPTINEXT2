const assert = require('assert');
const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { uploadUsers } = require('../controllers/authController');

console.log('=== TEST SUITE: USERS BULK UPLOAD MATCHING & SECURITY REGRESSION ===\n');

// Mock AuditLog to isolate from database writes
AuditLog.create = async function (entry) {
  return entry;
};

// In-Memory Database Harness
// Completely isolates tests from live/shared database
let mockDb = [];
const mockAdminId = new mongoose.Types.ObjectId();

function createMockId() {
  return new mongoose.Types.ObjectId();
}

function resetMockDb(initialUsers = []) {
  mockDb = initialUsers.map(u => ({
    _id: u._id || createMockId(),
    name: u.name || '',
    email: u.email ? u.email.toLowerCase().trim() : null,
    employeeId: u.employeeId ? String(u.employeeId).trim() : null,
    password: u.password !== undefined ? u.password : null,
    role: u.role || 'employee',
    organization: u.organization || '',
    designation: u.designation || '',
    location: u.location || '',
    supervisorName: u.supervisorName || '',
    isRosterOnly: Boolean(u.isRosterOnly),
    isVacant: Boolean(u.isVacant),
    isArchivedDemo: Boolean(u.isArchivedDemo),
    formAccessGranted: Boolean(u.formAccessGranted),
    isActive: u.isActive !== undefined ? u.isActive : true,
    async save() {
      return this;
    }
  }));
}

// Intercept Mongoose Model Methods
User.findById = async function (id) {
  return {
    _id: mockAdminId,
    name: 'Admin Tester',
    email: 'admin@example.com',
    role: 'admin'
  };
};

User.findOne = async function (filter) {
  if (filter.email) {
    const target = filter.email.toLowerCase().trim();
    const found = mockDb.find(u => u.email === target);
    return found || null;
  }
  if (filter.employeeId) {
    const target = String(filter.employeeId).trim();
    const found = mockDb.find(u => u.employeeId === target);
    return found || null;
  }
  return null;
};

User.create = async function (doc) {
  const newUser = {
    _id: createMockId(),
    ...doc,
    async save() {
      return this;
    }
  };
  mockDb.push(newUser);
  return newUser;
};

User.find = function (filter) {
  return {
    lean: async function () {
      return mockDb
        .filter(u => u.employeeId && /^BPER-\d+$/.test(u.employeeId))
        .map(u => ({ employeeId: u.employeeId }));
    }
  };
};

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

async function runUpload(usersArray) {
  const req = {
    body: { users: usersArray },
    user: { id: mockAdminId.toString(), role: 'admin' },
    headers: {}
  };
  const res = createMockRes();
  await uploadUsers(req, res);
  return res;
}

(async function runAllTests() {
  try {
    // -------------------------------------------------------------------------
    // Test 1: Existing user matched by email
    // -------------------------------------------------------------------------
    console.log('1. Testing existing user matched by email...');
    resetMockDb([
      {
        name: 'Alice Original',
        email: 'alice@example.com',
        employeeId: 'EMP-001',
        designation: 'Associate',
        location: 'HQ'
      }
    ]);

    let res = await runUpload([
      {
        name: 'Alice Updated',
        email: 'alice@example.com',
        employeeId: 'EMP-001',
        designation: 'Lead Analyst',
        location: 'Branch'
      }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 0);
    assert.strictEqual(res.body.updated, 1);
    assert.strictEqual(res.body.failed, 0);
    assert.strictEqual(mockDb[0].name, 'Alice Updated');
    assert.strictEqual(mockDb[0].designation, 'Lead Analyst');
    console.log('✅ PASS: Existing user matched by email updated successfully without duplicate creation.');

    // -------------------------------------------------------------------------
    // Test 2: Existing user matched by employee ID (roster record) without premature password creation
    // -------------------------------------------------------------------------
    console.log('\n2. Testing existing roster record linked to newly provided email (preserving roster-only and security)...');
    resetMockDb([
      {
        name: 'Bob Roster',
        email: null,
        employeeId: 'EMP-002',
        isRosterOnly: true,
        password: null,
        formAccessGranted: false
      }
    ]);

    res = await runUpload([
      {
        name: 'Bob Roster Active',
        email: 'bob@example.com',
        employeeId: 'EMP-002',
        designation: 'Consultant'
      }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 0);
    assert.strictEqual(res.body.updated, 1);
    assert.strictEqual(res.body.failed, 0);
    assert.strictEqual(mockDb[0].email, 'bob@example.com');
    assert.strictEqual(mockDb[0].isRosterOnly, true, 'isRosterOnly must remain true until user completes invite registration');
    assert.strictEqual(mockDb[0].password, null, 'No predictable default password should be set');
    assert.strictEqual(mockDb[0].formAccessGranted, false, 'formAccessGranted must remain false');
    console.log('✅ PASS: Roster-only staff linked to email without premature login activation or predictable password.');

    // -------------------------------------------------------------------------
    // Test 3: New employee creation as roster record
    // -------------------------------------------------------------------------
    console.log('\n3. Testing new employee creation as roster record...');
    resetMockDb([]);

    res = await runUpload([
      {
        name: 'Charlie New',
        email: 'charlie@example.com',
        employeeId: 'EMP-003',
        designation: 'Developer'
      }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 1);
    assert.strictEqual(res.body.updated, 0);
    assert.strictEqual(res.body.failed, 0);
    assert.strictEqual(mockDb.length, 1);
    assert.strictEqual(mockDb[0].employeeId, 'EMP-003');
    assert.strictEqual(mockDb[0].role, 'employee');
    assert.strictEqual(mockDb[0].isRosterOnly, true, 'New employee created as roster record awaiting invitation');
    assert.strictEqual(mockDb[0].password, undefined, 'No default password created for new roster record');
    console.log('✅ PASS: New employee created safely as roster record awaiting invite registration.');

    // -------------------------------------------------------------------------
    // Test 4: Duplicate employee ID across different email in DB
    // -------------------------------------------------------------------------
    console.log('\n4. Testing duplicate employee ID (attempt to bind existing employeeId to a different email)...');
    resetMockDb([
      {
        name: 'David Legitimate',
        email: 'david@example.com',
        employeeId: 'EMP-004'
      }
    ]);

    res = await runUpload([
      {
        name: 'David Hijacker',
        email: 'hijacker@example.com',
        employeeId: 'EMP-004'
      }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 0);
    assert.strictEqual(res.body.updated, 0);
    assert.strictEqual(res.body.failed, 1);
    assert.strictEqual(mockDb[0].email, 'david@example.com', 'Existing email must not be mutated');
    assert.ok(res.body.errors[0].includes('already registered'), 'Error message must specify employee ID is already registered');
    console.log('✅ PASS: Reassigning an existing employee ID to a different email is strictly rejected.');

    // -------------------------------------------------------------------------
    // Test 5: Duplicate email in DB (attempt to bind existing email to a different employee ID)
    // -------------------------------------------------------------------------
    console.log('\n5. Testing duplicate email (attempt to bind existing email to a different employee ID)...');
    resetMockDb([
      {
        name: 'Eve Legitimate',
        email: 'eve@example.com',
        employeeId: 'EMP-005'
      }
    ]);

    res = await runUpload([
      {
        name: 'Eve NewId',
        email: 'eve@example.com',
        employeeId: 'EMP-999'
      }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 0);
    assert.strictEqual(res.body.updated, 0);
    assert.strictEqual(res.body.failed, 1);
    assert.strictEqual(mockDb[0].employeeId, 'EMP-005', 'Existing employee ID must not be changed');
    assert.ok(res.body.errors[0].includes('already has employee ID'), 'Error message must note employee ID conflict');
    console.log('✅ PASS: Altering an existing user employee ID via email match is strictly rejected.');

    // -------------------------------------------------------------------------
    // Test 6: Employee ID and Email resolving to two different users (Dual-conflict)
    // -------------------------------------------------------------------------
    console.log('\n6. Testing employee ID and email resolving to two distinct users (Dual-identity conflict)...');
    resetMockDb([
      {
        name: 'User One',
        email: 'user1@example.com',
        employeeId: 'EMP-111'
      },
      {
        name: 'User Two',
        email: 'user2@example.com',
        employeeId: 'EMP-222'
      }
    ]);

    res = await runUpload([
      {
        name: 'Conflict User',
        email: 'user1@example.com',
        employeeId: 'EMP-222'
      }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 0);
    assert.strictEqual(res.body.updated, 0);
    assert.strictEqual(res.body.failed, 1);
    assert.ok(res.body.errors[0].includes('Identifier conflict'), 'Must reject dual identity conflict');
    assert.strictEqual(mockDb[0].name, 'User One');
    assert.strictEqual(mockDb[1].name, 'User Two');
    console.log('✅ PASS: Dual-identity conflict rejected cleanly without merging or corrupting records.');

    // -------------------------------------------------------------------------
    // Test 7: Missing required fields
    // -------------------------------------------------------------------------
    console.log('\n7. Testing missing required fields...');
    resetMockDb([]);

    res = await runUpload([
      { name: '', email: 'no_name@example.com', employeeId: 'E-1' },
      { name: 'No Email', email: '', employeeId: 'E-2' },
      { name: 'Invalid Email', email: 'invalid-email-format', employeeId: 'E-3' }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 0);
    assert.strictEqual(res.body.failed, 3);
    assert.strictEqual(res.body.errors.length, 3);
    assert.ok(res.body.errors[0].includes('Name is required'));
    assert.ok(res.body.errors[1].includes('Email is required'));
    assert.ok(res.body.errors[2].includes('Invalid email format'));
    console.log('✅ PASS: Missing name, missing email, and invalid email format are rejected.');

    // -------------------------------------------------------------------------
    // Test 8: Duplicate rows in the same uploaded file
    // -------------------------------------------------------------------------
    console.log('\n8. Testing duplicate rows within the same uploaded file...');
    resetMockDb([]);

    res = await runUpload([
      { name: 'First User', email: 'duplicate@example.com', employeeId: 'EMP-DUP-1' },
      { name: 'Second User With Same Email', email: 'duplicate@example.com', employeeId: 'EMP-DUP-2' },
      { name: 'Third User With Same EmpId', email: 'third@example.com', employeeId: 'EMP-DUP-1' }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 1, 'Only first unique user should be added');
    assert.strictEqual(res.body.failed, 2, 'Subsequent intra-file duplicates must fail');
    assert.ok(res.body.errors[0].includes('Duplicate email "duplicate@example.com" within upload file'));
    assert.ok(res.body.errors[1].includes('Duplicate employee ID "EMP-DUP-1" within upload file'));
    console.log('✅ PASS: Intra-file duplicates on email and employee ID are detected and blocked.');

    // -------------------------------------------------------------------------
    // Test 9: Partial import failures with strictly accurate result counts
    // -------------------------------------------------------------------------
    console.log('\n9. Testing partial import failures and accurate result counts...');
    resetMockDb([
      {
        name: 'Existing Member',
        email: 'existing@example.com',
        employeeId: 'EMP-EXISTING'
      }
    ]);

    const mixedBatch = [
      // Row 1: Valid new user -> Added
      { name: 'Valid New', email: 'validnew@example.com', employeeId: 'EMP-NEW' },
      // Row 2: Valid update -> Updated
      { name: 'Existing Member Updated', email: 'existing@example.com', employeeId: 'EMP-EXISTING' },
      // Row 3: Missing name -> Failed
      { name: '', email: 'missingname@example.com', employeeId: 'EMP-BAD1' },
      // Row 4: Duplicate of Row 1 in same file -> Failed
      { name: 'Repeated User', email: 'validnew@example.com', employeeId: 'EMP-NEW' },
      // Row 5: Completely empty row -> Skipped
      {},
      // Row 6: Invalid email format -> Failed
      { name: 'Bad Email', email: 'not-an-email', employeeId: 'EMP-BAD2' }
    ];

    res = await runUpload(mixedBatch);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 1, 'Added count must be exactly 1');
    assert.strictEqual(res.body.updated, 1, 'Updated count must be exactly 1');
    assert.strictEqual(res.body.skipped, 1, 'Skipped count must be exactly 1');
    assert.strictEqual(res.body.failed, 3, 'Failed count must be exactly 3');
    assert.strictEqual(res.body.errors.length, 3, 'Errors array must contain exactly 3 messages');

    // Verify sum of metrics equals total rows
    const totalProcessed = res.body.added + res.body.updated + res.body.skipped + res.body.failed;
    assert.strictEqual(totalProcessed, mixedBatch.length, 'Sum of all metric counts must exactly equal input batch size');
    console.log('✅ PASS: Partial import accurately reports added=1, updated=1, skipped=1, failed=3.');

    // -------------------------------------------------------------------------
    // Test 10: Vacant position protection
    // -------------------------------------------------------------------------
    console.log('\n10. Testing vacant position protection...');
    resetMockDb([
      {
        name: 'Vacant Position (BPER-V01)',
        email: null,
        employeeId: 'BPER-V01',
        isVacant: true,
        role: 'position',
        location: 'Branch Office',
        designation: 'Finance Associate'
      }
    ]);

    res = await runUpload([
      {
        name: 'Real Person Intruding Vacancy',
        email: 'person@example.com',
        employeeId: 'BPER-V01',
        designation: 'Modified Title'
      }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 0);
    assert.strictEqual(res.body.updated, 0);
    assert.strictEqual(res.body.failed, 1);
    assert.ok(res.body.errors[0].includes('vacant position'), 'Error must specify vacant position');
    // Ensure record was completely unmutated
    assert.strictEqual(mockDb[0].name, 'Vacant Position (BPER-V01)');
    assert.strictEqual(mockDb[0].email, null);
    assert.strictEqual(mockDb[0].isVacant, true);
    assert.strictEqual(mockDb[0].role, 'position');
    assert.strictEqual(mockDb[0].designation, 'Finance Associate');
    console.log('✅ PASS: Vacant position is completely protected against bulk upload mutation or conversion.');

    // -------------------------------------------------------------------------
    // Test 11: Archived demo account protection
    // -------------------------------------------------------------------------
    console.log('\n11. Testing archived demo account protection...');
    resetMockDb([
      {
        name: 'Demo Account Old',
        email: 'demo@example.com',
        employeeId: 'DEMO-001',
        isArchivedDemo: true,
        role: 'archived_demo',
        isActive: false
      }
    ]);

    res = await runUpload([
      {
        name: 'Reactivate Demo Account',
        email: 'demo@example.com',
        employeeId: 'DEMO-001',
        designation: 'New Title'
      }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 0);
    assert.strictEqual(res.body.updated, 0);
    assert.strictEqual(res.body.failed, 1);
    assert.ok(res.body.errors[0].includes('archived demo account'), 'Error must specify archived demo account');
    // Ensure record was completely unmutated
    assert.strictEqual(mockDb[0].name, 'Demo Account Old');
    assert.strictEqual(mockDb[0].isArchivedDemo, true);
    assert.strictEqual(mockDb[0].isActive, false);
    console.log('✅ PASS: Archived demo account is completely protected against bulk upload mutation or reactivation.');

    // -------------------------------------------------------------------------
    // Test 12: Preservation of existing user passwords
    // -------------------------------------------------------------------------
    console.log('\n12. Testing preservation of existing passwords on update...');
    const existingSecretHash = '$2a$10$UnbrokenHashOfAStrongUserPassword1234567890';
    resetMockDb([
      {
        name: 'Active Staff Member',
        email: 'activestaff@example.com',
        employeeId: 'EMP-ACTIVE',
        password: existingSecretHash,
        isRosterOnly: false,
        formAccessGranted: true,
        designation: 'Junior Analyst'
      }
    ]);

    res = await runUpload([
      {
        name: 'Active Staff Member Renamed',
        email: 'activestaff@example.com',
        employeeId: 'EMP-ACTIVE',
        designation: 'Senior Analyst'
      }
    ]);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.added, 0);
    assert.strictEqual(res.body.updated, 1);
    assert.strictEqual(res.body.failed, 0);
    // Profile updated
    assert.strictEqual(mockDb[0].name, 'Active Staff Member Renamed');
    assert.strictEqual(mockDb[0].designation, 'Senior Analyst');
    // Security credentials and privileges preserved strictly intact
    assert.strictEqual(mockDb[0].password, existingSecretHash, 'Existing password hash must never be modified');
    assert.strictEqual(mockDb[0].isRosterOnly, false);
    assert.strictEqual(mockDb[0].formAccessGranted, true);
    console.log('✅ PASS: Existing user passwords, account activation, and formAccessGranted are preserved intact.');

    console.log('\n============================================================');
    console.log('🎉 ALL 12 SECURITY & REGRESSION TESTS PASSED SUCCESSFULLY!');
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n❌ TEST FAILED WITH ERROR:', err);
    process.exit(1);
  }
})();
