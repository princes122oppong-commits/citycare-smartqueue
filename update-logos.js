const fs = require('fs');
const path = require('path');

const loginPages = ['login.html', 'register.html', 'admin-login.html', 'receptionist-login.html', 'department-login.html'];
const receptionistPages = [
  'receptionist/html/receptionist-dashboard.html',
  'receptionist/html/patients.html',
  'receptionist/html/appointments.html',
  'receptionist/html/queue-management.html',
  'receptionist/html/active-queue.html',
  'receptionist/html/department-queue.html',
  'receptionist/html/walkin-registration.html',
  'receptionist/html/profile.html'
];
const adminPages = [
  'admin/html/admin-dashboard.html',
  'admin/html/users.html',
  'admin/html/departments.html',
  'admin/html/appointments.html',
  'admin/html/queue.html',
  'admin/html/reports.html',
  'admin/html/settings.html'
];
const patientPages = [
  'patients/html/patients-dashboard.html',
  'patients/html/queue-status.html',
  'patients/html/book-appointment.html',
  'patients/html/join-queue.html',
  'patients/html/notifications.html',
  'patients/html/profile.html'
];
const departmentPages = [
  'department/dashboard.html',
  'department/appointments.html',
  'department/queue.html'
];

const allPages = [...loginPages, ...receptionistPages, ...adminPages, ...patientPages, ...departmentPages];

function updateLogoInFile(filePath) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(fullPath, 'utf8');

  // Update logo image source to citycare.png
  content = content.replace(
    /<img[^>]*src\s*=\s*["'][^"']*logo[^"']*\.(png|jpg|jpeg|svg)["'][^>]*\/?>/gi,
    '<img src="citycare.png" alt="CityCare Logo" style="height: 60px;">'
  );

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`Updated logo in: ${filePath}`);
}

console.log('Updating logos across all pages...');
allPages.forEach(updateLogoInFile);
console.log('Logo update complete!');