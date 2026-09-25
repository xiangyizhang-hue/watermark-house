<script setup lang="ts">
import { configModules, type ConfigModule } from '../../core/configModules'
const props = defineProps<{ modelValue: ConfigModule[] }>()
const emit = defineEmits<{ 'update:modelValue': [ConfigModule[]] }>()
function toggle(id: ConfigModule, checked: boolean) { emit('update:modelValue', checked ? [...props.modelValue,id] : props.modelValue.filter(v => v !== id)) }
</script>
<template><fieldset><legend>选择要传递的模块</legend><label v-for="m in configModules" :key="m.id"><input type="checkbox" :checked="modelValue.includes(m.id)" @change="toggle(m.id, ($event.target as HTMLInputElement).checked)"> {{ m.label }}</label></fieldset></template>
<style scoped>fieldset { border: 1px solid var(--border); padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px; } label { cursor: pointer; }</style>
