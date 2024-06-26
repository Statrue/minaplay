<template>
  <to-top-container class="page-height overflow-auto">
    <v-container class="d-flex flex-column py-md-12">
      <span class="text-h4">{{ t('source.title') }}</span>
      <v-row class="mt-3" dense>
        <v-col cols="12" sm="auto" class="flex-grow-1">
          <v-text-field
            variant="outlined"
            density="compact"
            color="primary"
            :prepend-inner-icon="mdiMagnify"
            hide-details
            :label="t('app.input.keyword')"
            :placeholder="t('app.input.placeholder', { item: t('app.entities.source') })"
            clearable
            v-model.trim="keyword"
            @update:model-value="useQuery"
          ></v-text-field>
        </v-col>
        <v-col sm="auto">
          <v-btn
            variant="flat"
            block
            height="40"
            color="info"
            :prepend-icon="mdiRefresh"
            :loading="loading"
            @click="request()"
          >
            {{ t('app.actions.refresh') }}
          </v-btn>
        </v-col>
        <v-col cols="auto">
          <v-btn
            height="40"
            color="success"
            variant="flat"
            :prepend-icon="mdiPlus"
            :loading="creating"
            @click="createSource()"
            block
          >
            {{ t('app.actions.add') }}
          </v-btn>
        </v-col>
      </v-row>
      <v-divider class="my-2"></v-divider>
      <multi-items-loader :loader="sourcesLoader" class="px-0 py-2 mt-2" auto>
        <v-row>
          <v-col v-for="source in sources" :key="source.id" cols="12" sm="6" md="4">
            <source-overview :source="source" @updated="onSourceUpdate"></source-overview>
          </v-col>
        </v-row>
      </multi-items-loader>
    </v-container>
  </to-top-container>
</template>

<script setup lang="ts">
import ToTopContainer from '@/components/app/ToTopContainer.vue';
import { useI18n } from 'vue-i18n';
import { MessageSchema } from '@/lang';
import { useApiStore } from '@/store/api';
import { useAxiosPageLoader } from '@/composables/use-axios-page-loader';
import SourceOverview from '@/components/source/SourceOverview.vue';
import { SourceEntity, SourceQueryDto } from '@/api/interfaces/subscribe.interface';
import { ref } from 'vue';
import { mdiMagnify, mdiPlus, mdiRefresh } from '@mdi/js';
import { debounce } from '@/utils/utils';
import MultiItemsLoader from '@/components/app/MultiItemsLoader.vue';
import { useRouter } from 'vue-router';
import { useAxiosRequest } from '@/composables/use-axios-request';
import { useToastStore } from '@/store/toast';

const { t } = useI18n<{ message: MessageSchema }>();
const api = useApiStore();
const toast = useToastStore();
const router = useRouter();

const sourcesLoader = useAxiosPageLoader(
  async (query: SourceQueryDto = {}) => {
    return await api.Source.query({
      ...query,
      keyword: keyword.value,
    });
  },
  { page: 0, size: 24 },
);
const { items: sources, pending: loading, reload: request } = sourcesLoader;

const keyword = ref('');
const useQuery = debounce(sourcesLoader.reload, 1000);

const {
  pending: creating,
  request: createSource,
  onResolved: onCreated,
  onRejected: onCreateFailed,
} = useAxiosRequest(async () => {
  return await api.Source.create({
    title: t('source.unnamed'),
    url: 'https://example.com/rss.xml',
  });
});
onCreated(async (data) => {
  await router.push({ path: `/source/${data.id}` });
});
onCreateFailed((error: any) => {
  toast.toastError(t(`error.${error.response?.data?.code ?? 'other'}`));
});

const onSourceUpdate = (source: SourceEntity) => {
  const index = sourcesLoader.items.value.findIndex(({ id }) => id === source.id);
  if (index >= 0) {
    sourcesLoader.items.value[index] = source;
  }
};
</script>

<style scoped lang="sass"></style>
