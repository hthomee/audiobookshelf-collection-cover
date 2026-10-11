<template>
  <modals-modal v-model="show" name="new-collection" :width="500" :height="'unset'" :processing="processing">
    <template #outer>
      <div class="absolute top-0 left-0 p-5 w-2/3 overflow-hidden">
        <p class="text-3xl text-white truncate">{{ $strings.HeaderCollection }}</p>
      </div>
    </template>
    <form class="p-4 w-full text-sm rounded-lg bg-bg shadow-lg border border-black-300" @submit.prevent="submitForm">
      <ui-text-input-with-label v-model="newCollectionName" :label="$strings.LabelName" :placeholder="$strings.PlaceholderNewCollection" class="mb-2" />
      <ui-textarea-with-label v-model="newCollectionDescription" :label="$strings.LabelDescription" />
      <div class="flex justify-end pt-4">
        <ui-btn color="bg-success" type="submit" :disabled="!newCollectionName">{{ $strings.ButtonCreate }}</ui-btn>
      </div>
    </form>
  </modals-modal>
</template>

<script>
export default {
  props: {
    value: Boolean
  },
  data() {
    return {
      processing: false,
      newCollectionName: '',
      newCollectionDescription: ''
    }
  },
  watch: {
    show(newVal) {
      if (newVal) {
        this.newCollectionName = ''
        this.newCollectionDescription = ''
      }
    }
  },
  computed: {
    show: {
      get() {
        return this.value
      },
      set(val) {
        this.$emit('input', val)
      }
    },
    currentLibraryId() {
      return this.$store.state.libraries.currentLibraryId
    }
  },
  methods: {
    submitForm() {
      if (!this.newCollectionName) {
        return this.$toast.error(this.$strings.ToastNameRequired)
      }
      this.processing = true

      const newCollection = {
        libraryId: this.currentLibraryId,
        name: this.newCollectionName,
        description: this.newCollectionDescription || null,
        books: []
      }
      this.$axios
        .$post('/api/collections', newCollection)
        .then((collection) => {
          this.show = false
          this.$router.push(`/collection/${collection.id}`)
        })
        .catch((error) => {
          console.error('Failed to create collection', error)
          this.$toast.error(error.response?.data || this.$strings.ToastUnknownError)
        })
        .finally(() => {
          this.processing = false
        })
    }
  }
}
</script>
