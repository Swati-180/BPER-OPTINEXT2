const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Fitment = require('./models/Fitment');
const WDTSubmission = require('./models/WDTSubmission');
const Taxonomy = require('./models/Taxonomy');
const ProcessAnalysis = require('./models/ProcessAnalysis');
const bcrypt = require('bcryptjs');

dotenv.config({ path: './server/.env' });

const users = [
  {
    name: 'QG Admin',
    email: 'admin@BPER.com',
    password: 'Admin@123',
    role: 'manager',
    employeeId: 'BPER-000',
    designation: 'Administrator',
    band: 'N/A',
    client: 'BPER',
    location: 'Corporate',
    supervisorName: 'N/A',
    supervisorTitle: 'N/A',
    isActive: true
  },
  {
    name: 'QG Employee',
    email: 'employee@bper.com',
    password: 'Employee@123',
    role: 'employee',
    employeeId: 'BPER-001',
    designation: 'Operations Analyst',
    band: 'B3',
    client: 'BPER Internal',
    location: 'Corporate',
    supervisorName: 'QG Admin',
    supervisorTitle: 'Administrator',
    isActive: true
  },
  {
    name: 'Michael Smith',
    email: 'Michael@Employee.com',
    password: 'Michael@123',
    role: 'employee',
    employeeId: 'BPER-101',
    designation: 'Financial Analyst',
    band: 'B2',
    client: 'US-CLIENT-01',
    location: 'New York',
    supervisorName: 'QG Admin',
    supervisorTitle: 'Administrator',
    isActive: true
  },
  {
    name: 'Sarah Johnson',
    email: 'Sarah@Employee.com',
    password: 'Sarah@123',
    role: 'employee',
    employeeId: 'BPER-102',
    designation: 'HR Coordinator',
    band: 'B1',
    client: 'US-CLIENT-02',
    location: 'Chicago',
    supervisorName: 'QG Admin',
    supervisorTitle: 'Administrator',
    isActive: true
  },
  {
    name: 'David Miller',
    email: 'David@Employee.com',
    password: 'David@123',
    role: 'employee',
    employeeId: 'BPER-103',
    designation: 'IT Specialist',
    band: 'B3',
    client: 'US-CLIENT-03',
    location: 'San Francisco',
    supervisorName: 'QG Admin',
    supervisorTitle: 'Administrator',
    isActive: true
  },
  {
    name: 'Emily Davis',
    email: 'Emily@Employee.com',
    password: 'Emily@123',
    role: 'employee',
    employeeId: 'BPER-104',
    designation: 'Operations Lead',
    band: 'B4',
    client: 'US-CLIENT-04',
    location: 'Austin',
    supervisorName: 'QG Admin',
    supervisorTitle: 'Administrator',
    isActive: true
  },
  {
    name: 'Robert Wilson',
    email: 'Robert@Employee.com',
    password: 'Robert@123',
    role: 'employee',
    employeeId: 'BPER-105',
    designation: 'Senior Auditor',
    band: 'B5',
    client: 'US-CLIENT-05',
    location: 'Seattle',
    supervisorName: 'QG Admin',
    supervisorTitle: 'Administrator',
    isActive: true
  }
];

const processes = [
  "Accounts Payable", "Accounts Receivable", "General Ledger", "Payroll", "Procurement", "Customer Support", "IT Infrastructure"
];

const subProcesses = [
  "Invoice Validation", "Vendon Management", "Payment Batch Processing", "Journal Entry", "Reporting", "User Access Management", "Network Security"
];

const taxonomyData = [
  {
    majorProcess: "Accounts Payable",
    process: "Invoice Processing",
    subProcesses: ["Validation and Posting", "Batch Creation", "Exception Handling"]
  },
  {
    majorProcess: "Accounts Payable",
    process: "Vendor Management",
    subProcesses: ["Vendor Onboarding", "KYC Verification", "Dispute Resolution"]
  },
  {
    majorProcess: "General GL",
    process: "Month End",
    subProcesses: ["GIT Entries", "Accruals", "Reporting"]
  },
  {
    majorProcess: "Human Resources",
    process: "Payroll",
    subProcesses: ["Audit Support", "Disbursement", "Tax Filing"]
  }
];

async function seed() {
  try {
    const connStr = process.env.MONGODB_URI;
    console.log('Connecting to:', connStr);
    await mongoose.connect(connStr);
    console.log('Connected to MongoDB Atlas');

    // Clear existing
    await User.deleteMany({});
    await Fitment.deleteMany({});
    await WDTSubmission.deleteMany({});
    await Taxonomy.deleteMany({});
    await ProcessAnalysis.deleteMany({});
    console.log('Cleared existing data');

    // Insert taxonomy
    await Taxonomy.insertMany(taxonomyData);
    console.log('Inserted Seed Taxonomy');

    // Insert users
    for (const u of users) {
      await User.create(u);
    }
    console.log('Inserted Seed Users');

    // Generate random submissions for each employee
    const employees = users.filter(u => u.role === 'employee');
    for (const emp of employees) {
      // Create 2 submissions per employee
      for (let i = 0; i < 2; i++) {
        const rows = [];
        const rowCount = 3 + Math.floor(Math.random() * 4);
        let totalH = 0;
        
        for (let j = 0; j < rowCount; j++) {
            const h = 10 + Math.floor(Math.random() * 40);
            totalH += h;
            rows.push({
                activityCategory: Math.random() > 0.3 ? 'core' : 'support',
                majorProcess: processes[Math.floor(Math.random() * processes.length)],
                process: subProcesses[Math.floor(Math.random() * subProcesses.length)],
                subProcess: "Standard Operating Procedure " + (j + 1),
                frequency: "Monthly",
                volumesMonthly: 100 + Math.floor(Math.random() * 500),
                timeTakenHoursPerMonth: h,
                applicationsUsed: "ERP, Excel, SAP",
                comments: "Regular quarterly activity review."
            });
        }

        await WDTSubmission.create({
            referenceId: `BPER-${emp.employeeId}-${Date.now().toString().slice(-4)}-${i}`,
            submittedAt: new Date(Date.now() - (i * 86400000 * 2)), // staggered dates
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
            status: i === 0 ? 'Under Review' : 'Approved',
            employee: {
                employeeId: emp.employeeId,
                name: emp.name,
                email: emp.email,
                department: emp.designation.split(' ')[0], // close enough for demo
                designation: emp.designation,
                location: emp.location,
                organization: 'BPER'
            },
            payload: { rows },
            totalHours: totalH,
            coreCount: rows.filter(r => r.activityCategory === 'core').length,
            supportCount: rows.filter(r => r.activityCategory === 'support').length,
            pendingFrom: i === 0 ? 'QG Admin' : 'NA'
        });
      }
    }
    console.log('Generated Random WDT Submissions');

    // Insert ProcessAnalysis for 6x6
    const analysisRecords = [
      { process: 'Invoice Validation', department: 'Finance', type: 'Core', criteria: ['H', 'M', 'H', 'L', 'M', 'H', 'H', 'M', 'L', 'H', 'M', 'H'] },
      { process: 'Payroll Disbursement', department: 'HR', type: 'Core', criteria: ['M', 'H', 'H', 'M', 'L', 'H', 'M', 'H', 'H', 'M', 'L', 'H'] },
      { process: 'Network Security', department: 'IT', type: 'Core', criteria: ['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'] },
      { process: 'Vendor Onboarding', department: 'Finance', type: 'Support', criteria: ['L', 'M', 'L', 'H', 'M', 'L', 'M', 'H', 'L', 'M', 'H', 'L'] },
      { process: 'User Access Mgmt', department: 'IT', type: 'Support', criteria: ['M', 'L', 'M', 'H', 'H', 'M', 'L', 'M', 'H', 'L', 'M', 'H'] },
      { process: 'Tax Filing', department: 'HR', type: 'Specialized', criteria: ['H', 'H', 'L', 'M', 'H', 'H', 'L', 'M', 'H', 'H', 'L', 'M'] }
    ];

    await ProcessAnalysis.insertMany(analysisRecords);
    console.log('Inserted Process Analysis Data (6x6)');

    console.log('Seeding Complete!');
    process.exit(0);
  } catch (err) {
    console.error('Seeding Failed:', err);
    process.exit(1);
  }
}

seed();
