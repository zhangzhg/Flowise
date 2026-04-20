// assets
import {
    IconTrash,
    IconFileUpload,
    IconFileExport,
    IconCopy,
    IconMessage,
    IconDatabaseExport,
    IconAdjustmentsHorizontal,
    IconUsers,
    IconTemplate
} from '@tabler/icons-react'

// constant
const icons = {
    IconTrash,
    IconFileUpload,
    IconFileExport,
    IconCopy,
    IconMessage,
    IconDatabaseExport,
    IconAdjustmentsHorizontal,
    IconUsers,
    IconTemplate
}

// ==============================|| SETTINGS MENU ITEMS ||============================== //

const settings = {
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
            id: 'viewUpsertHistory',
            title: 'Upsert History',
            titleKey: 'settingsMenu.viewUpsertHistory',
            type: 'item',
            url: '',
            icon: icons.IconDatabaseExport
        },
        {
            id: 'chatflowConfiguration',
            title: 'Configuration',
            titleKey: 'settingsMenu.configuration',
            type: 'item',
            url: '',
            permission: 'chatflows:config',
            icon: icons.IconAdjustmentsHorizontal
        },
        {
            id: 'saveAsTemplate',
            title: 'Save As Template',
            titleKey: 'settingsMenu.saveAsTemplate',
            type: 'item',
            url: '',
            icon: icons.IconTemplate,
            permission: 'templates:flowexport'
        },
        {
            id: 'duplicateChatflow',
            title: 'Duplicate Chatflow',
            titleKey: 'settingsMenu.duplicateChatflow',
            type: 'item',
            url: '',
            icon: icons.IconCopy,
            permission: 'chatflows:duplicate'
        },
        {
            id: 'loadChatflow',
            title: 'Load Chatflow',
            titleKey: 'settingsMenu.loadChatflow',
            type: 'item',
            url: '',
            icon: icons.IconFileUpload,
            permission: 'chatflows:import'
        },
        {
            id: 'exportChatflow',
            title: 'Export Chatflow',
            titleKey: 'settingsMenu.exportChatflow',
            type: 'item',
            url: '',
            icon: icons.IconFileExport,
            permission: 'chatflows:export'
        },
        {
            id: 'deleteChatflow',
            title: 'Delete Chatflow',
            titleKey: 'settingsMenu.deleteChatflow',
            type: 'item',
            url: '',
            icon: icons.IconTrash,
            permission: 'chatflows:delete'
        }
    ]
}

export default settings
