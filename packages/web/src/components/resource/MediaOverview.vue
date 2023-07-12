<script setup lang="ts">
import { MediaEntity } from '@/interfaces/media.interface';
import { Api } from '@/api/api';
import MediaCoverFallback from '@/assets/media_cover_fallback.jpg';
import TimeAgo from '@/components/provider/TimeAgo.vue';
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    media: MediaEntity;
    playOnHover?: boolean;
  }>(),
  {
    playOnHover: false,
  },
);

const sourceText = computed(() => {
  switch (props.media.file?.source) {
    case 'ARIA2_DOWNLOAD':
      return '自动下载';
    case 'USER_UPLOAD':
      return '用户上传';
    case 'AUTO_GENERATED':
      return '自动生成';
    default:
      return '未知来源';
  }
});

const videoRef = ref<HTMLVideoElement>(null as any);
const handleHover = async (isHovering: boolean) => {
  if (isHovering && videoRef.value) {
    await videoRef.value.play();
  } else {
    await videoRef.value.pause();
    await videoRef.value.load();
  }
};
</script>

<template>
  <v-container fluid class="pa-0 d-flex flex-column media-container">
    <v-hover
      :disabled="!playOnHover"
      open-delay="400"
      v-slot:default="{ isHovering, props }"
      @update:model-value="handleHover"
    >
      <v-responsive v-bind="props" :aspect-ratio="16 / 9" max-height="200">
        <video
          ref="videoRef"
          class="poster video-js video-container"
          :src="Api.File.buildRawPath(media.file!.id)"
          :controls="isHovering"
          preload="metadata"
          muted
          :poster="media.poster ? Api.File.buildRawPath(media.poster!.id) : MediaCoverFallback"
          controlslist="nodownload noremoteplayback"
          disablepictureinpicture
        ></video>
      </v-responsive>
    </v-hover>

    <span class="mt-2 media-title font-weight-bold" :title="media.name">{{ media.name }}</span>
    <div class="mt-1 text-caption">
      <span>{{ sourceText }}</span>
      ·
      <time-ago :time="media.createAt"></time-ago>
    </div>
  </v-container>
</template>

<style scoped lang="sass">
.media-container
  cursor: pointer

.poster
  border-radius: 8px

.video-container
  width: 100%
  height: 100%
  object-fit: cover

.media-title
  overflow: hidden
  font-size: 1rem
  line-height: 1.5rem
  max-height: 3rem
  word-break: break-all
  text-overflow: ellipsis
</style>