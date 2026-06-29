const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User');
const Fitment = require('./models/Fitment');
const WDTSubmission = require('./models/WDTSubmission');
const Taxonomy = require('./models/Taxonomy');
const ProcessAnalysis = require('./models/ProcessAnalysis');
const bcrypt = require('bcryptjs');
const mockProcessData = require('./utils/mockProcessData');

dotenv.config({ path: './.env' });

const users = [
  {
    name: 'QG Admin',
    email: 'admin@BPER.com',
    password: 'Admin@123',
    role: 'admin',
    employeeId: 'BPER-000',
    designation: 'Administrator',
    department: 'Corporate',
    band: 'N/A',
    client: 'BPER',
    location: 'Corporate',
    supervisorTitle: 'N/A',
    isActive: true
  },
  {
    name: 'QG Manager',
    email: 'manager@bper.com',
    password: 'Manager@123',
    role: 'manager',
    employeeId: 'BPER-999',
    designation: 'Operations Manager',
    department: 'Corporate',
    band: 'M1',
    client: 'BPER',
    location: 'Corporate',
    supervisorName: 'QG Admin',
    supervisorTitle: 'Administrator',
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

    // Insert basic taxonomy data first
    await Taxonomy.insertMany(taxonomyData);
    console.log('Inserted Seed Taxonomy');

    // Insert mock data from JSON files
    console.log('Loading and processing mock data from JSON files...');
    
    const sixBySixRecords = mockProcessData.buildTaxonomyFromSixBySix();
    if (sixBySixRecords.length > 0) {
      try {
        await Taxonomy.insertMany(sixBySixRecords, { ordered: false });
        console.log(`Inserted ${sixBySixRecords.length} records from 6x6 data`);
      } catch (err) {
        if (err.code !== 11000) throw err;
        console.log('6x6 data: some duplicates skipped');
      }
    }

    const faRecords = mockProcessData.buildTaxonomyFromFAActivities();
    if (faRecords.length > 0) {
      try {
        await Taxonomy.insertMany(faRecords, { ordered: false });
        console.log(`Inserted ${faRecords.length} records from FA activities`);
      } catch (err) {
        if (err.code !== 11000) throw err;
        console.log('FA activities: some duplicates skipped');
      }
    }

    const hrRecords = mockProcessData.buildTaxonomyFromHRActivities();
    if (hrRecords.length > 0) {
      try {
        await Taxonomy.insertMany(hrRecords, { ordered: false });
        console.log(`Inserted ${hrRecords.length} records from HR activities`);
      } catch (err) {
        if (err.code !== 11000) throw err;
        console.log('HR activities: some duplicates skipped');
      }
    }

    // Insert users
    for (const u of users) {
      await User.create(u);
    }
    console.log('Inserted Seed Users');

    // Load 6x6 data to extract real processes for seeding submissions
    const fs = require('fs');
    const path = require('path');
    let realProcessesByDept = { 'F&A': [], 'HR': [], 'Logistics': [], 'SCM': [] };

    function isNumericLabel(value) {
      if (typeof value !== 'string') return false;
      return /^\d+(\.\d+)*$/.test(value.trim());
    }

    function resolveProcessLabel(activity) {
      const name = (activity?.name || '').trim();
      const id = (activity?.id || '').trim();

      if (name && !isNumericLabel(name)) return name;
      if (id && !isNumericLabel(id)) return id;
      if (name) return name;
      if (id) return id;
      return 'Unknown';
    }

    function resolveParentLabel(proc) {
      const name = (proc?.name || '').trim();
      const id = (proc?.id || '').trim();

      if (name && !isNumericLabel(name)) return name;
      if (id && !isNumericLabel(id)) return id;
      if (name) return name;
      if (id) return id;
      return 'Unknown';
    }

    try {
      const dataPath = path.join(__dirname, '..', '6x6_data (1).json');
      if (fs.existsSync(dataPath)) {
        const fileContent = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
        if (fileContent && fileContent.departments) {
          fileContent.departments.forEach(dept => {
            let deptKey = dept.id || dept.name;
            if (deptKey === 'Finance & Accounting' || deptKey === 'Finance') {
              deptKey = 'F&A';
            }
            if (realProcessesByDept[deptKey] && dept.processes) {
              dept.processes.forEach(p => {
                const parentLabel = resolveParentLabel(p);
                if (p.activities) {
                  p.activities.forEach(act => {
                    const activityLabel = resolveProcessLabel(act);
                    if (activityLabel && !isNumericLabel(activityLabel)) {
                      realProcessesByDept[deptKey].push({
                        majorProcess: parentLabel,
                        process: activityLabel,
                        subProcess: activityLabel,
                        activityCategory: act.type?.toLowerCase() || 'core'
                      });
                    }
                  });
                }
              });
            }
          });
        }
      }
    } catch (err) {
      console.warn('Could not parse 6x6_data (1).json for matching seeds:', err.message);
    }

    // Generate random submissions for each employee
    const employees = users.filter(u => u.role === 'employee');
    for (const emp of employees) {
      // Map employee to one of the 6x6 departments
      let deptName = 'F&A';
      if (emp.designation.toLowerCase().includes('hr') || emp.name.toLowerCase().includes('sarah')) {
        deptName = 'HR';
      } else if (emp.designation.toLowerCase().includes('it') || emp.name.toLowerCase().includes('david')) {
        deptName = 'Logistics';
      } else if (emp.designation.toLowerCase().includes('lead') || emp.name.toLowerCase().includes('emily')) {
        deptName = 'SCM';
      }
      
      const deptProcesses = realProcessesByDept[deptName] || [];

      // Create 2 submissions per employee
      for (let i = 0; i < 2; i++) {
        const rows = [];
        const rowCount = 3 + Math.floor(Math.random() * 4);
        let totalH = 0;
        
        for (let j = 0; j < rowCount; j++) {
            const h = 10 + Math.floor(Math.random() * 40);
            totalH += h;
            
            let actRow = {
                activityCategory: Math.random() > 0.3 ? 'core' : 'support',
                majorProcess: processes[Math.floor(Math.random() * processes.length)],
                process: subProcesses[Math.floor(Math.random() * subProcesses.length)],
                subProcess: "Standard Operating Procedure " + (j + 1),
                frequency: "Monthly",
                volumesMonthly: 100 + Math.floor(Math.random() * 500),
                timeTakenHoursPerMonth: h,
                applicationsUsed: "ERP, Excel, SAP",
                comments: "Regular quarterly activity review."
            };

            if (deptProcesses.length > 0) {
              const selectedAct = deptProcesses[Math.floor(Math.random() * deptProcesses.length)];
              actRow = {
                activityCategory: selectedAct.activityCategory === 'support' ? 'support' : 'core',
                majorProcess: selectedAct.majorProcess,
                process: selectedAct.process,
                subProcess: selectedAct.subProcess,
                frequency: "Monthly",
                volumesMonthly: 100 + Math.floor(Math.random() * 500),
                timeTakenHoursPerMonth: h,
                applicationsUsed: "ERP, Excel, SAP",
                comments: "Regular quarterly activity review."
              };
            }
            
            rows.push(actRow);
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
                department: deptName,
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
    console.log('Generated Random WDT Submissions aligned with 6x6 process names');

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

    // Insert mock ProcessAnalysis records from JSON files
    const mockAnalysisRecords = mockProcessData.buildProcessAnalysisRecords();
    if (mockAnalysisRecords.length > 0) {
      try {
        await ProcessAnalysis.insertMany(mockAnalysisRecords, { ordered: false });
        console.log(`Inserted ${mockAnalysisRecords.length} mock ProcessAnalysis records`);
      } catch (err) {
        if (err.code !== 11000) throw err;
        console.log('Mock analysis records: some duplicates skipped');
      }
    }

    // Insert Fitment data
    const fitmentRecords = employees.map((emp, idx) => {
      const scores = [45, 72, 88, 58, 92, 65, 78, 55, 81, 68];
      const labels = ['TRAIN TO FIT', 'FIT', 'FIT', 'TRAIN TO FIT', 'FIT', 'TRAIN TO FIT', 'FIT', 'TRAIN TO FIT', 'FIT', 'TRAIN TO FIT'];
      return {
        employeeId: emp.employeeId,
        name: emp.name,
        designation: emp.designation,
        band: emp.band,
        department: emp.designation.split(' ')[0],
        weightedScore: scores[idx % scores.length],
        fitmentLabel: labels[idx % labels.length],
        evaluatedAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000), // within last 90 days
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
      };
    });

    await Fitment.insertMany(fitmentRecords);
    console.log('Inserted Fitment Data');

    console.log('Seeding Complete!');
    if (require.main === module) process.exit(0);
  } catch (err) {
    console.error('Seeding Failed:', err);
    if (require.main === module) process.exit(1);
    throw err;
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed, taxonomyData, users };
