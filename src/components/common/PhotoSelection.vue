<script setup lang="ts">
import { computed } from 'vue'
import { useLibrary } from '../../composables/useLibrary'
const props = defineProps<{ excludeId?: string | null }>()
const library = useLibrary()
const photos = computed(() => library.items.filter(i => i.id !== props.excludeId))
</script>
<template>
  <section class="selection" aria-label="目标照片">
    <div><button @click="library.setSelected(photos.map(p => p.id), true)">全选</button> <button @click="library.setSelected(photos.map(p => p.id), false)">取消全选</button> 已选 {{ photos.filter(p => p.selected).length }} 张</div>
    <div class="photo-list"><label v-for="p in photos" :key="p.id"><input type="checkbox" :checked="p.selected" @change="library.toggleSelect(p.id)"><img v-if="p.thumbUrl" :src="p.thumbUrl" alt=""> <span>{{ p.name }}</span></label></div>
    <p v-if="!photos.length">暂无其他照片，请先导入。</p>
  </section>
</template>
<style scoped>
.selection { margin: 12px 0; font-size: 13px; }
.photo-list { max-height: 220px; overflow: auto; display: grid; gap: 6px; margin-top: 8px; }
.photo-list label { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 4px; cursor: pointer; }
.photo-list img { width: 48px; height: 32px; object-fit: cover; }
.photo-list span { overflow-wrap: anywhere; }
button { padding: 7px; background: var(--hover); color: var(--text); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; }
</style>
