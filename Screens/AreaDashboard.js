import React from 'react';
import ManagerDashboard from './ManagerDashboard';

export default function AreaDashboard({ route, navigation }) {
    const { userProfile } = route.params || {};
    return (
        <ManagerDashboard
            route={{ params: { userProfile: { ...userProfile, role: 'Area Manager' } } }}
            navigation={navigation}
        />
    );
}
