<template>
  <v-container class="pa-0 pb-12">
    <span class="text-h4">{{ t('rule.sections.info') }}</span>
    <single-item-loader class="px-0 py-2 mt-4" :loader="ruleLoader">
      <div class="d-flex flex-column">
        <v-text-field
          :label="t('rule.entity.id')"
          variant="outlined"
          hide-details
          color="primary"
          density="compact"
          v-model.trim="edit!.id"
          readonly
          :append-inner-icon="mdiPencilLock"
        ></v-text-field>
        <v-text-field
          :label="t('rule.entity.remark')"
          class="mt-4"
          variant="outlined"
          color="primary"
          density="compact"
          v-model.trim="edit!.remark"
          maxlength="40"
          counter="40"
          persistent-counter
        ></v-text-field>
        <v-autocomplete
          :label="t('rule.entity.sources')"
          class="mt-4"
          variant="outlined"
          color="primary"
          density="comfortable"
          multiple
          chips
          closable-chips
          v-model="edit!.sourceIds"
          :items="sourcesLoader.data.value?.items ?? rule?.sources"
          :item-title="(item) => item.title ?? item.remark ?? t('rule.unnamed')"
          item-value="id"
          :loading="sourcesLoader.pending.value"
          hide-details
          :no-data-text="t('app.loader.empty')"
          @focus.once="sourcesLoader.request()"
          clearable
          :filter-keys="['title', 'remark', 'url']"
          :item-props="(item) => ({ density: 'comfortable', subtitle: item.url })"
        ></v-autocomplete>
        <div class="mt-4 d-flex flex-row justify-space-between align-center">
          <span class="text-h6">{{ t('rule.info.code') }}</span>
          <v-menu location="bottom right">
            <v-list density="compact">
              <v-list-item
                density="compact"
                link
                v-for="(template, index) in templates"
                :prepend-icon="template.icon"
                :key="index"
                @click="selectTemplate(template.value as any)"
              >
                {{ t(`rule.templates.${template.key}`) }}
              </v-list-item>
            </v-list>
            <template #activator="{ props }">
              <v-btn
                v-bind="props"
                :append-icon="mdiChevronDown"
                density="comfortable"
                variant="tonal"
                color="secondary"
              >
                {{ t('rule.template') }}
              </v-btn>
            </template>
          </v-menu>
        </div>
        <monaco-editor
          ref="editorRef"
          class="border rounded mt-2"
          v-model:value="edit!.code"
          language="typescript"
          @save="save()"
          style="min-height: 360px"
        ></monaco-editor>
        <div class="d-flex flex-row mt-4">
          <v-btn
            @click="save()"
            :loading="saving"
            variant="tonal"
            color="primary"
            class="flex-grow-1"
            :prepend-icon="mdiCheck"
          >
            {{ t('app.actions.save') }}
          </v-btn>
          <v-btn @click="reset()" color="warning" variant="tonal" class="flex-grow-0 ml-2" :prepend-icon="mdiClose">
            {{ t('app.actions.reset') }}
          </v-btn>
        </div>
        <span class="text-h4 mt-12">{{ t('rule.info.actions') }}</span>
        <v-sheet class="my-4" border rounded>
          <v-container class="pa-4 d-flex flex-row align-center justify-space-between">
            <v-container class="pa-0">
              <p class="text-subtitle-1">{{ t('rule.info.duplicate') }}</p>
              <p class="text-caption">{{ t('rule.info.duplicateDescription') }}</p>
            </v-container>
            <v-btn class="ml-4" variant="tonal" color="primary" :loading="ruleDuplicating" @click="duplicateRule">
              {{ t('rule.info.duplicateBtn') }}
            </v-btn>
          </v-container>
          <v-divider class="ml-4"></v-divider>
          <v-container class="pa-4 d-flex flex-row align-center justify-space-between">
            <v-container class="pa-0">
              <p class="text-subtitle-1">{{ t('rule.info.delete') }}</p>
              <p class="text-caption">{{ t('rule.info.deleteDescription') }}</p>
            </v-container>
            <v-dialog width="auto" close-on-content-click>
              <v-card>
                <v-card-title>{{ t('app.actions.deleteTitle') }}</v-card-title>
                <v-card-text>{{ t('app.actions.deleteConfirm', { item: t('app.entities.rule') }) }}</v-card-text>
                <v-card-actions>
                  <v-spacer></v-spacer>
                  <v-btn color="primary" variant="text">
                    {{ t('app.cancel') }}
                  </v-btn>
                  <v-btn color="error" variant="plain" @click="deleteRule()">
                    {{ t('app.ok') }}
                  </v-btn>
                </v-card-actions>
              </v-card>
              <template #activator="{ props }">
                <v-btn v-bind="props" class="ml-4" variant="tonal" color="error" :loading="ruleDeleting">
                  {{ t('app.actions.delete') }}
                </v-btn>
              </template>
            </v-dialog>
          </v-container>
        </v-sheet>
      </div>
    </single-item-loader>
  </v-container>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useAxiosRequest } from '@/composables/use-axios-request';
import { ref } from 'vue';
import { useApiStore } from '@/store/api';
import { useRoute, useRouter } from 'vue-router';
import SingleItemLoader from '@/components/app/SingleItemLoader.vue';
import {
  mdiApplicationBracketsOutline,
  mdiCheck,
  mdiCheckAll,
  mdiChevronDown,
  mdiClose,
  mdiFilterCogOutline,
  mdiPencilLock,
  mdiRegex,
} from '@mdi/js';
import { useToastStore } from '@/store/toast';
import MonacoEditor from '@/components/app/MonacoEditor.vue';

const { t } = useI18n();
const api = useApiStore();
const route = useRoute();
const router = useRouter();
const toast = useToastStore();

const ruleLoader = useAxiosRequest(async () => {
  return await api.Rule.getById(Number(route.params.id))();
});
ruleLoader.onResolved((data) => {
  edit.value = { ...data, sourceIds: data.sources.map(({ id }) => id) };
});
const { data: rule } = ruleLoader;
const edit = ref({ ...rule.value, sourceIds: rule.value?.sources.map(({ id }) => id) ?? [] });

const sourcesLoader = useAxiosRequest(async () => {
  return await api.Source.query({ size: 1024 });
});

const templates = [
  { key: 'default', icon: mdiApplicationBracketsOutline, value: () => import('@/api/templates/default.ts?raw') },
  { key: 'regexp', icon: mdiRegex, value: () => import('@/api/templates/regexp.ts?raw') },
  { key: 'filter', icon: mdiFilterCogOutline, value: () => import('@/api/templates/filter.ts?raw') },
  { key: 'download-all', icon: mdiCheckAll, value: () => import('@/api/templates/download-all.ts?raw') },
];
const selectTemplate = async (loader: () => Promise<{ default: string }>) => {
  editorRef.value?.getEditor()?.setValue((await loader()).default);
};

const {
  pending: saving,
  request: save,
  onResolved: onSaved,
  onRejected: onSaveFailed,
} = useAxiosRequest(async () => {
  return await api.Rule.update(Number(route.params.id))({
    remark: edit.value?.remark,
    code: edit.value?.code,
    sourceIds: edit.value?.sourceIds,
  });
});
onSaved((data) => {
  toast.toastSuccess(t('app.actions.saveToast'));
  ruleLoader.data.value = data;
});
onSaveFailed((error: any) => {
  toast.toastError(t(`error.${error.response?.data?.code ?? 'other'}`));
});

const {
  pending: ruleDuplicating,
  request: duplicateRule,
  onResolved: onRuleDuplicated,
  onRejected: onRuleDuplicateFailed,
} = useAxiosRequest(async () => {
  return await api.Rule.create({
    remark: `${rule.value?.remark || t('rule.unnamed')} ${t('rule.info.copyLabel')}`,
    code: rule.value?.code,
    sourceIds: rule.value?.sources.map(({ id }) => id),
  });
});
onRuleDuplicated(async (data) => {
  toast.toastSuccess(t('app.actions.saveToast'));
  await router.replace({ path: `/rule/${data.id}` });
  await ruleLoader.request();
});
onRuleDuplicateFailed((error: any) => {
  toast.toastError(t(`error.${error.response?.data?.code ?? 'other'}`));
});

const {
  pending: ruleDeleting,
  request: deleteRule,
  onResolved: onRuleDeleted,
  onRejected: onRuleDeleteFailed,
} = useAxiosRequest(async () => {
  return await api.Rule.delete(Number(route.params.id))();
});
onRuleDeleted(async () => {
  toast.toastSuccess(t('app.actions.deleteToast'));
  await router.replace({ path: '/rule' });
});
onRuleDeleteFailed((error: any) => {
  toast.toastError(t(`error.${error.response?.data?.code ?? 'other'}`));
});

const editorRef = ref<typeof MonacoEditor>();
const reset = () => {
  edit.value = { ...rule.value!, sourceIds: rule.value?.sources.map(({ id }) => id) ?? [] };
  editorRef.value?.getEditor()?.setValue(edit.value.code);
};
</script>

<style scoped lang="sass"></style>
