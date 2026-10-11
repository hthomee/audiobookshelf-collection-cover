<template>
  <div class="relative rounded-xs overflow-hidden" :style="{ width: width + 'px', height: height + 'px' }">
    <!-- <div class="absolute top-0 left-0 w-full h-full rounded-xs overflow-hidden z-10">
      <div class="w-full h-full border border-white/10" />
    </div> -->

    <div v-if="hasOwnCover" class="w-full h-full relative rounded-xs">
      <div v-show="showCoverBg" class="bg-primary absolute top-0 left-0 w-full h-full overflow-hidden">
        <div class="absolute cover-bg" ref="coverBg" />
      </div>
      <img ref="cover" :src="fullCoverUrl" @error="imageError" @load="imageLoaded" class="w-full h-full absolute top-0 left-0" :class="showCoverBg ? 'object-contain' : 'object-cover'" />
    </div>
    <div v-else-if="books.length" class="flex justify-center h-full relative bg-primary/95 rounded-xs">
      <div class="absolute top-0 left-0 w-full h-full bg-gray-400/5" />

      <covers-book-cover :library-item="books[0]" :width="width / 2" :book-cover-aspect-ratio="bookCoverAspectRatio" />
      <covers-book-cover v-if="books.length > 1" :library-item="books[1]" :width="width / 2" :book-cover-aspect-ratio="bookCoverAspectRatio" />
    </div>
    <div v-else class="relative w-full h-full flex items-center justify-center p-2 bg-primary rounded-xs">
      <div class="absolute top-0 left-0 w-full h-full bg-gray-400/5" />

      <p class="text-white/60 text-center" :style="{ fontSize: Math.min(1, sizeMultiplier) + 'rem' }">Empty Collection</p>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    bookItems: {
      type: Array,
      default: () => []
    },
    collection: {
      type: Object,
      default: () => null
    },
    width: Number,
    height: Number,
    bookCoverAspectRatio: Number
  },
  data() {
    return {
      imageFailed: false,
      showCoverBg: false
    }
  },
  computed: {
    sizeMultiplier() {
      if (this.bookCoverAspectRatio === 1) return this.width / (120 * 1.6 * 2)
      return this.width / 240
    },
    hasOwnCover() {
      return !!this.collection?.coverPath && !this.imageFailed
    },
    fullCoverUrl() {
      if (!this.collection?.coverPath) return null
      const store = this.$store || this.$nuxt.$store
      return `${store.state.routerBasePath}/api/collections/${this.collection.id}/cover?ts=${this.collection.lastUpdate}`
    },
    books() {
      return this.bookItems || []
    }
  },
  watch: {
    fullCoverUrl() {
      this.imageFailed = false
    }
  },
  methods: {
    imageError(err) {
      console.error('Failed to load collection cover', err)
      // Fall back to the book covers
      this.imageFailed = true
    },
    imageLoaded() {
      if (!this.$refs.cover) return
      const { naturalWidth, naturalHeight } = this.$refs.cover
      const aspectRatio = naturalHeight / naturalWidth
      const containerAspectRatio = this.height / this.width

      // Show blurred background with contained image if the cover does not fit the collection aspect ratio
      if (Math.abs(aspectRatio - containerAspectRatio) > 0.15) {
        this.showCoverBg = true
        this.$nextTick(() => {
          if (this.$refs.coverBg) this.$refs.coverBg.style.backgroundImage = `url("${this.fullCoverUrl}")`
        })
      } else {
        this.showCoverBg = false
      }
    }
  },
  mounted() {}
}
</script>
