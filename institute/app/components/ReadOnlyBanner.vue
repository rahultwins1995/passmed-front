<script setup lang="ts">
import type { InstituteArea } from '../utils/institutePermissions'

/**
 * Shown at the top of a page when the user can SEE it but not change it —
 * i.e. their permission level for `area` is exactly `view`.
 *
 *   <ReadOnlyBanner area="seats_cohorts" />
 *
 * Without this, a Professor on `view` would just find buttons quietly missing
 * and assume the page was broken. The banner tells them why.
 *
 * This is UX only. The real enforcement is the `perm:` middleware on the
 * Laravel routes — every mutation endpoint 403s regardless of what the UI shows.
 */
const props = defineProps<{
  area: InstituteArea | string
  /** Optional override, e.g. "You can view cohorts but not change them." */
  message?: string
}>()

const { readOnly } = useInstitutePermissions()

const show = computed(() => readOnly(props.area))
</script>

<template>
  <div v-if="show" class="ro-banner" role="status">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
    <span>{{ message || 'View only — you don’t have permission to make changes here.' }}</span>
  </div>
</template>

<style scoped>
.ro-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  padding: 9px 12px;
  border: 1px solid #fde68a;
  border-radius: 8px;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.78rem;
  font-weight: 600;
}
.ro-banner svg { flex: 0 0 auto; }
</style>
