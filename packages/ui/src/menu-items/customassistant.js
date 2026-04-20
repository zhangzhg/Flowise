// assets
import { IconTrash, IconMessage, IconAdjustmentsHorizontal, IconUsers } from '@tabler/icons-react'

// constant
const icons = {
    IconTrash,
    IconMessage,
    IconAdjustmentsHorizontal,
    IconUsers
}

// ==============================|| SETTINGS MENU ITEMS ||============================== //

const customAssistantSettings = {
    id: 'settings',
    title: '',
    type: 'group',
    children: [
        {
            id: 'viewMessages',
            title: 'View Messages',
            titleKey: 'settingsMenu.viewMessages',
            type: 'item',
            url: '',
            icon: icons.IconMessage
        },
        {
            id: 'viewLeads',
            title: 'View Leads',
            titleKey: 'settingsMenu.viewLeads',
            type: 'item',
            url: '',
            icon: icons.IconUsers
        },
        {
            id: 'chatflowConfiguration',
            title: 'Configuration',
            titleKey: 'settingsMenu.configuration',
            type: 'item',
            url: '',
            icon: icons.IconAdjustmentsHorizontal,
            permission: 'assistants:update'
        },
        {
            id: 'deleteAssistant',
            title: 'Delete Assistant',
            titleKey: 'settingsMenu.deleteAssistant',
            type: 'item',
            url: '',
            icon: icons.IconTrash,
            permission: 'assistants:delete'
        }
    ]
}

export default customAssistantSettings
