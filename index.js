// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const mainNav = document.getElementById('mainNav');

navToggle?.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  navToggle.classList.toggle('open', isOpen);
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

// Close the mobile menu after tapping a nav link
mainNav?.addEventListener('click', (e) => {
  if (e.target.tagName === 'A' && mainNav.classList.contains('open')) {
    mainNav.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});

// Highlight active nav link on scroll
const sections = document.querySelectorAll('main section[id]');
const navLinks = document.querySelectorAll('.main-nav a[href^="#"]');

const setActiveLink = () => {
  let current = 'home';
  sections.forEach((section) => {
    const top = section.offsetTop - 120;
    if (window.scrollY >= top) current = section.id;
  });
  navLinks.forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === `#${current}`);
  });
};

window.addEventListener('scroll', setActiveLink);
setActiveLink();

// Always route Staff Portal through the staff login screen first.
document.querySelector('.portal-staff')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = 'staff-login.html';
});

// "Join Queue" routes patients to the queue status page (auth guard on that page).
document.querySelector('.hero-cta .btn-outline')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.location.href = 'patients/html/queue-status.html';
});
