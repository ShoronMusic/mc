import {
  ADMIN_CATEGORIES,
  ADMIN_SECTIONS,
  countAdminSectionsByCategory,
  getAdminSectionsByCategory,
  isAdminCategoryId,
} from './admin-sections';

const counts = countAdminSectionsByCategory();
const total = ADMIN_SECTIONS.length;
const sum = Object.values(counts).reduce((a, b) => a + b, 0);

const allHaveCategory = ADMIN_SECTIONS.every((s) => isAdminCategoryId(s.category));
const billingHasGathering = getAdminSectionsByCategory('billing').some(
  (s) => s.href === '/admin/gathering-history',
);

const ok =
  sum === total &&
  total >= 25 &&
  allHaveCategory &&
  billingHasGathering &&
  ADMIN_CATEGORIES.length === 5 &&
  counts.billing >= 6 &&
  counts.library >= 8;

if (!ok) {
  console.error('admin-sections unit tests: FAILED', { total, sum, counts });
  process.exit(1);
}
console.log('admin-sections unit tests: OK');
