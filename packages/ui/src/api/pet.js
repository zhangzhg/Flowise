import client from './client'

const getMyPet = () => client.get('/pet/me')

const createPet = (body) => client.post('/pet/me', body)

const updatePet = (body) => client.put('/pet/me', body)

const deletePet = () => client.delete('/pet/me')

const feedCard = (body) => client.post('/pet/me/cards', body)

const listCards = (params) => client.get('/pet/me/cards', { params })

export default {
    getMyPet,
    createPet,
    updatePet,
    deletePet,
    feedCard,
    listCards
}
