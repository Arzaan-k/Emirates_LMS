import React from 'react';
import ManagerDashboard from './ManagerDashboard';

export default function CityDashboard({ route, navigation }) {
    const { userProfile } = route.params || {};
    return (
        <ManagerDashboard
            route={{ params: { userProfile: { ...userProfile, role: 'City Manager' } } }}
            navigation={navigation}
        />
    );
}
