import React from 'react';
import ManagerDashboard from './ManagerDashboard';

export default function StoreDashboard({ route, navigation }) {
    const { userProfile } = route.params || {};
    return (
        <ManagerDashboard
            route={{ params: { userProfile: { ...userProfile, role: 'Store Manager' } } }}
            navigation={navigation}
        />
    );
}
