<template>
  <modals-modal v-model="show" name="edit-collection" :width="700" :height="'unset'" :processing="processing">
    <template #outer>
      <div class="absolute top-0 left-0 p-5 w-2/3 overflow-hidden">
        <p class="text-3xl text-white truncate">{{ $strings.HeaderCollection }}</p>
      </div>
    </template>
    <div class="p-4 w-full text-sm py-6 rounded-lg bg-bg shadow-lg border border-black-300 relative overflow-hidden" style="min-height: 400px; max-height: 80vh">
      <template v-if="!showImageUploader">
        <form @submit.prevent="submitForm">
          <div class="flex flex-wrap">
            <div class="w-full flex flex-col items-center mb-2 md:w-auto md:mb-0 md:block">
              <covers-collection-cover :book-items="books" :collection="currentCollection" :width="200" :height="100 * bookCoverAspectRatio" :book-cover-aspect-ratio="bookCoverAspectRatio" />
              <ui-btn small type="button" class="mt-2 w-full flex items-center justify-center" @click="showImageUploader = true">
                <span class="material-symbols text-lg mr-1">image</span>
                {{ $strings.LabelCover }}
              </ui-btn>
            </div>
            <div class="grow px-4">
              <ui-text-input-with-label v-model="newCollectionName" :label="$strings.LabelName" class="mb-2" />

              <ui-textarea-with-label v-model="newCollectionDescription" :label="$strings.LabelDescription" />
            </div>
          </div>
          <div class="absolute bottom-0 left-0 right-0 w-full py-4 px-4 flex">
            <ui-btn v-if="userCanDelete" small color="bg-error" type="button" @click.stop="removeClick">{{ $strings.ButtonRemove }}</ui-btn>
            <div class="grow" />
            <ui-btn color="bg-success" type="submit">{{ $strings.ButtonSave }}</ui-btn>
          </div>
        </form>
      </template>
      <template v-else>
        <div class="flex items-center mb-3">
          <div class="hover:bg-white/10 cursor-pointer h-11 w-11 flex items-center justify-center rounded-full" @click="showImageUploader = false">
            <span class="material-symbols text-4xl">arrow_back</span>
          </div>
          <p class="ml-2 text-xl mb-1">{{ $strings.HeaderCover }}</p>
        </div>
        <div class="flex flex-wrap">
          <div class="w-full flex justify-center mb-4 md:w-auto md:block">
            <div v-if="previewUpload" class="relative bg-primary rounded-xs overflow-hidden" :style="{ width: '200px', height: 100 * bookCoverAspectRatio + 'px' }">
              <img :src="previewUpload" class="w-full h-full object-contain" />
            </div>
            <covers-collection-cover v-else :book-items="books" :collection="currentCollection" :width="200" :height="100 * bookCoverAspectRatio" :book-cover-aspect-ratio="bookCoverAspectRatio" />
          </div>
          <div class="grow md:px-4">
            <div v-if="previewUpload" class="flex justify-end">
              <ui-btn type="button" class="mr-2" @click="resetCoverPreview">{{ $strings.ButtonReset }}</ui-btn>
              <ui-btn type="button" color="bg-success" @click="submitCoverUpload">{{ $strings.ButtonUpload }}</ui-btn>
            </div>
            <template v-else>
              <div v-if="userCanUpload" class="flex items-center mb-4">
                <div class="w-10 md:w-40 pr-2 md:min-w-32">
                  <ui-file-input ref="fileInput" @change="fileUploadSelected">
                    <span class="hidden md:inline-block">{{ $strings.ButtonUploadCover }}</span>
                    <span class="material-symbols text-2xl inline-block md:hidden!">upload</span>
                  </ui-file-input>
                </div>
                <form @submit.prevent="submitCoverUrl" class="flex grow">
                  <ui-text-input v-model="imageUrl" :placeholder="$strings.LabelImageURLFromTheWeb" class="h-9 w-full" />
                  <ui-btn color="bg-success" type="submit" :padding-x="4" :disabled="!imageUrl" class="ml-2 sm:ml-3 w-24 h-9">{{ $strings.ButtonSubmit }}</ui-btn>
                </form>
              </div>
              <ui-btn v-if="hasOwnCover" small color="bg-error" type="button" @click="removeCover">{{ $strings.LabelRemoveCover }}</ui-btn>
            </template>
          </div>
        </div>
      </template>
    </div>
  </modals-modal>
</template>

<script>
export default {
  data() {
    return {
      processing: false,
      newCollectionName: null,
      newCollectionDescription: null,
      showImageUploader: false,
      updatedCollection: null,
      imageUrl: '',
      previewUpload: null,
      selectedFile: null
    }
  },
  watch: {
    show: {
      handler(newVal) {
        if (newVal) {
          this.init()
        }
      }
    }
  },
  computed: {
    show: {
      get() {
        return this.$store.state.globals.showEditCollectionModal
      },
      set(val) {
        this.$store.commit('globals/setShowEditCollectionModal', val)
      }
    },
    bookCoverAspectRatio() {
      return this.$store.getters['libraries/getBookCoverAspectRatio']
    },
    collection() {
      return this.$store.state.globals.selectedCollection || {}
    },
    currentCollection() {
      // Collection is refetched after the cover was changed
      return this.updatedCollection || this.collection
    },
    hasOwnCover() {
      return !!this.currentCollection.coverPath
    },
    collectionName() {
      return this.collection.name
    },
    books() {
      return this.collection.books || []
    },
    userCanDelete() {
      return this.$store.getters['user/getUserCanDelete']
    },
    userCanUpload() {
      return this.$store.getters['user/getUserCanUpload']
    }
  },
  methods: {
    init() {
      this.newCollectionName = this.collectionName
      this.newCollectionDescription = this.collection.description || ''
      this.showImageUploader = false
      this.updatedCollection = null
      this.imageUrl = ''
      this.resetCoverPreview()
    },
    async refreshCollection() {
      const collection = await this.$axios.$get(`/api/collections/${this.collection.id}`).catch((error) => {
        console.error('Failed to get collection', error)
        return null
      })
      if (collection) this.updatedCollection = collection
    },
    fileUploadSelected(file) {
      this.previewUpload = URL.createObjectURL(file)
      this.selectedFile = file
    },
    resetCoverPreview() {
      if (this.$refs.fileInput) {
        this.$refs.fileInput.reset()
      }
      if (this.previewUpload) URL.revokeObjectURL(this.previewUpload)
      this.previewUpload = null
      this.selectedFile = null
    },
    submitCoverUpload() {
      const form = new FormData()
      form.set('cover', this.selectedFile)
      this.updateCover(form)
    },
    submitCoverUrl() {
      if (!this.imageUrl.startsWith('http:') && !this.imageUrl.startsWith('https:')) {
        return this.$toast.error(this.$strings.ToastInvalidUrl)
      }
      this.updateCover({ url: this.imageUrl })
    },
    async updateCover(payload) {
      this.processing = true
      try {
        await this.$axios.$post(`/api/collections/${this.collection.id}/cover`, payload)
        this.imageUrl = ''
        this.resetCoverPreview()
        await this.refreshCollection()
      } catch (error) {
        console.error('Failed to update collection cover', error)
        this.$toast.error(error.response?.data || this.$strings.ToastCoverUpdateFailed)
      }
      this.processing = false
    },
    async removeCover() {
      this.processing = true
      try {
        await this.$axios.$delete(`/api/collections/${this.collection.id}/cover`)
        await this.refreshCollection()
      } catch (error) {
        console.error('Failed to remove collection cover', error)
        this.$toast.error(error.response?.data || this.$strings.ToastRemoveFailed)
      }
      this.processing = false
    },
    removeClick() {
      const payload = {
        message: this.$getString('MessageConfirmRemoveCollection', [this.collectionName]),
        callback: (confirmed) => {
          if (confirmed) {
            this.deleteCollection()
          }
        },
        type: 'yesNo'
      }
      this.$store.commit('globals/setConfirmPrompt', payload)
    },
    deleteCollection() {
      this.processing = true
      this.$axios
        .$delete(`/api/collections/${this.collection.id}`)
        .then(() => {
          this.show = false
          this.$toast.success(this.$strings.ToastCollectionRemoveSuccess)
        })
        .catch((error) => {
          console.error('Failed to remove collection', error)
          this.$toast.error(this.$strings.ToastRemoveFailed)
        })
        .finally(() => {
          this.processing = false
        })
    },
    submitForm() {
      if (this.newCollectionName === this.collectionName && this.newCollectionDescription === this.collection.description) {
        return
      }
      if (!this.newCollectionName) {
        return this.$toast.error(this.$strings.ToastNameRequired)
      }

      this.processing = true

      var collectionUpdate = {
        name: this.newCollectionName,
        description: this.newCollectionDescription || null
      }
      this.$axios
        .$patch(`/api/collections/${this.collection.id}`, collectionUpdate)
        .then((collection) => {
          console.log('Collection Updated', collection)
          this.processing = false
          this.show = false
          this.$toast.success(this.$strings.ToastCollectionUpdateSuccess)
        })
        .catch((error) => {
          console.error('Failed to update collection', error)
          this.processing = false
          this.$toast.error(this.$strings.ToastFailedToUpdate)
        })
    }
  },
  mounted() {},
  beforeDestroy() {}
}
</script>
