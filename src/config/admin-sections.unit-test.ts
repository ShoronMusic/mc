import {
  ADMIN_CATEGORIES,
  ADMIN_SECTIONS,
  countAdminSectionsByCategory,
  getAdminSectionsByCategory,
  isAdminCategoryId,
  isAdminSectionActive,
} from './admin-sections';

const counts = countAdminSectionsByCategory();
const total = ADMIN_SECTIONS.length;
const sum = Object.values(counts).reduce((a, b) => a + b, 0);

const allHaveCategory = ADMIN_SECTIONS.every((s) => isAdminCategoryId(s.category));
const billingHasGathering = getAdminSectionsByCategory('billing').some(
  (s) => s.href === '/admin/gathering-history',
);

const librarySections = getAdminSectionsByCategory('library');
const libraryIdx = librarySections.findIndex((s) => s.href === '/admin/library');
const westernRegister = librarySections[libraryIdx + 1];
const westernRegisterBesideLibrary =
  libraryIdx >= 0 &&
  westernRegister?.href === '/admin/songs/list' &&
  westernRegister.title.includes('洋楽');
const uniqueHrefs = new Set(ADMIN_SECTIONS.map((s) => s.href)).size === ADMIN_SECTIONS.length;
const listSection = ADMIN_SECTIONS.find((s) => s.href === '/admin/songs/list')!;
const dashboardSection = ADMIN_SECTIONS.find((s) => s.href === '/admin/songs')!;
const newFormHighlightsList =
  isAdminSectionActive('/admin/songs/new', listSection) &&
  !isAdminSectionActive('/admin/songs/new', dashboardSection);
const listWinsOverDashboard =
  isAdminSectionActive('/admin/songs/list', listSection) &&
  !isAdminSectionActive('/admin/songs/list', dashboardSection);
const noStandaloneNewSongNav = !ADMIN_SECTIONS.some((s) => s.href === '/admin/songs/new');
const detailKeepsDashboard = isAdminSectionActive(
  '/admin/songs/cd689902-7bf7-4bde-8a2e-1e1c9835027a',
  dashboardSection,
);

const ok =
  sum === total &&
  total >= 25 &&
  allHaveCategory &&
  billingHasGathering &&
  ADMIN_CATEGORIES.length === 5 &&
  counts.billing >= 6 &&
  counts.library >= 8 &&
  westernRegisterBesideLibrary &&
  uniqueHrefs &&
  newFormHighlightsList &&
  listWinsOverDashboard &&
  noStandaloneNewSongNav &&
  detailKeepsDashboard;

if (!ok) {
  console.error('admin-sections unit tests: FAILED', { total, sum, counts });
  process.exit(1);
}
console.log('admin-sections unit tests: OK');
