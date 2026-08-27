<script setup lang="ts">
// "Login as" chooser — shown after login only when the user can enter more than one
// portal. A single-portal user never sees this (they're routed straight in).
const { isOpen, portals, close } = usePortalPicker()
const router = useRouter()

const choose = async (p: any) => {
  close()
  if (p?.path) await router.push(p.path)
}
</script>

<template>
  <div v-if="isOpen" class="pp-overlay">
    <div class="pp-box" @click.stop>
      <div class="pp-title">Continue as</div>
      <div class="pp-sub">You have access to more than one area. Choose how you want to continue.</div>

      <button
        v-for="p in portals"
        :key="p.key"
        type="button"
        class="pp-opt"
        @click="choose(p)"
      >
        <span class="pp-opt-label">{{ p.label }}</span>
        <span class="pp-opt-arrow">→</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pp-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
}
.pp-box {
  background: #fff;
  width: 100%;
  max-width: 400px;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
}
.pp-title {
  font-family: 'Figtree', sans-serif;
  font-size: 1.15rem;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 4px;
}
.pp-sub {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 18px;
}
.pp-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 14px 16px;
  margin-bottom: 10px;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
}
.pp-opt:hover {
  border-color: #06b6d4;
  background: #f0feff;
  transform: translateY(-1px);
}
.pp-opt:last-child { margin-bottom: 0; }
.pp-opt-label {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}
.pp-opt-arrow {
  font-size: 1.1rem;
  color: #06b6d4;
  font-weight: 800;
}
</style>
