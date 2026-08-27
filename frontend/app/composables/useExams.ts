interface ExamsResponse {
  data: any[]
  pricingarray: Record<string, any>
  status?: string
}

export const useExams = () => {
  return useAsyncData<ExamsResponse>('exams', async () => {
    const res = await $fetch<ExamsResponse>(getApiPath('exams'))
    return res || { data: [], pricingarray: {} }
  }, {
    server: true,
    lazy: false,
    default: () => ({ data: [], pricingarray: {} }),
  })
}