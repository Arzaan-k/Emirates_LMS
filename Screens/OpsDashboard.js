import React from 'react';
import ManagerDashboard from './ManagerDashboard';

export default function OpsDashboard({ route, navigation }) {
    // Force specific role props or just pass through
    // specialized logic for OPS can go here
    const { userProfile } = route.params || {};
    return (
        <ManagerDashboard
            route={{ params: { userProfile: { ...userProfile, role: 'Ops Manager' } } }}
            navigation={navigation}
        />
    );
}
