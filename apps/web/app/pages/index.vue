<script setup lang="ts">
import type { HealthResponse } from '@nest-nuxt-stack/shared';

const config = useRuntimeConfig();
const apiBase = import.meta.server
  ? (config.apiBaseServer as string)
  : (config.public.apiBase as string);

const { data: health, error } = await useFetch<HealthResponse>(
  `${apiBase}/health`,
);
</script>

<template>
  <div class="page">
    <h1>NestJS + Nuxt 4</h1>
    <p>Single-port stack with Nest as API host and Nuxt SSR.</p>

    <section v-if="health" class="card">
      <h2>API health (SSR-fetched)</h2>
      <p><strong>Status:</strong> {{ health.status }}</p>
      <p><strong>Timestamp:</strong> {{ health.timestamp }}</p>
    </section>

    <section v-else-if="error" class="card error">
      <h2>API unreachable</h2>
      <p>{{ error.message }}</p>
    </section>
  </div>
</template>

<style scoped>
.page {
  font-family: system-ui, sans-serif;
  max-width: 40rem;
  margin: 3rem auto;
  padding: 0 1rem;
  line-height: 1.5;
}

.card {
  margin-top: 1.5rem;
  padding: 1rem 1.25rem;
  border: 1px solid #ddd;
  border-radius: 0.5rem;
  background: #fafafa;
}

.error {
  border-color: #f5c2c7;
  background: #f8d7da;
}
</style>
