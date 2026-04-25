import client from './client'

const getMyPet = () => client.get('/pet/me')

const createPet = (body) => client.post('/pet/me', body)

const updatePet = (body) => client.put('/pet/me', body)

const deletePet = () => client.delete('/pet/me')

const feedCard = (body) => client.post('/pet/me/cards', body)

const listCards = (params) => client.get('/pet/me/cards', { params })

const getSkillBindings = (petId) => client.get(`/pets/${petId}/skill-bindings`)

const createSkillBinding = (petId, body) => client.post(`/pets/${petId}/skill-bindings`, body)

const deleteSkillBinding = (petId, bindingId) => client.delete(`/pets/${petId}/skill-bindings/${bindingId}`)

export default {
    getMyPet,
    createPet,
    updatePet,
    deletePet,
    feedCard,
    listCards,
    getSkillBindings,
    createSkillBinding,
    deleteSkillBinding
}
